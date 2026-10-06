"""LangGraph workflows for Gemini ideation and multimodal video coaching."""
from __future__ import annotations

import io
import json
import logging
import os
import re
import time
from typing import Any, TypedDict

from dotenv import load_dotenv
from fastapi.concurrency import run_in_threadpool
from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel, Field, ValidationError, ConfigDict, model_validator
from langgraph.graph import END, START, StateGraph

load_dotenv()
logger = logging.getLogger(__name__)
FILE_PROCESSING_TIMEOUT_SECONDS = 120


def _get_client() -> genai.Client:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set in environment")
    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=120_000))


def _model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


_IDEATION_SYSTEM = (
    "You are a presentation coach for video content creators. "
    "Given the user's topic, return ONLY a valid JSON array (no prose, no markdown fences). "
    "Each item must have exactly two string fields: "
    '`text` (a short script line the creator will say) and '
    '`gesture` (the matching body movement, hand gesture, posture shift, or visual hook). '
    "Provide 5 to 7 items that flow naturally as a short script. "
    "Output JSON only. Example shape: "
    '[{"text":"Open with a smile and a question.","gesture":"Lean slightly forward, raise eyebrows, open palms."}]'
)


def _extract_json(raw: str) -> list[dict[str, Any]]:
    """Pull a JSON array out of the model response, tolerating markdown fences."""
    if not isinstance(raw, str):
        return []
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    # Find the first [ and last ] to be safe.
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    cleaned: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        if not isinstance(item.get("text"), str) or not isinstance(item.get("gesture"), str):
            continue
        text_v = item["text"].strip()
        gesture_v = item["gesture"].strip()
        if text_v and gesture_v:
            cleaned.append({"text": text_v, "gesture": gesture_v})
    return cleaned


_VIDEO_REVIEW_PROMPT = (
    "You are an expert presentation coach for video content creators. "
    "Watch the visual delivery AND listen to the audio. Return JSON matching the provided schema. "
    "Include strengths (3-5 concrete observations), drills (3-5 actionable practice drills), "
    "and notes (timestamped recommendations). Give 4-8 notes when the footage supports them, "
    "or fewer for a short take, with at least one grounded observation. "
    "Each note has integer start and end times in seconds from the beginning of the video "
    "and a concise text recommendation. For a point use equal start and end values. "
    "Only reference moments actually present in the recording; never invent events or timestamps."
)


class TimestampedNote(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    text: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_range(self):
        if self.end < self.start:
            raise ValueError("Note end must not precede its start")
        return self


class VideoReview(BaseModel):
    strengths: list[str] = Field(min_length=1)
    drills: list[str] = Field(min_length=1)
    notes: list[TimestampedNote] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_bullets(self):
        if any(not item.strip() for item in self.strengths + self.drills):
            raise ValueError("Review bullets must not be blank")
        return self


def _review_markdown(review: VideoReview) -> str:
    # Preserve the public API while making the stored format deterministic.
    def line(text: str) -> str:
        return " ".join(text.split())

    def timestamp(seconds: int) -> str:
        return f"{seconds // 60}:{seconds % 60:02d}"

    lines = ["## Strengths", *[f"- {line(x)}" for x in review.strengths],
             "", "## Specific Drills", *[f"- {line(x)}" for x in review.drills],
             "", "## Timestamped Notes"]
    for note in sorted(review.notes, key=lambda note: note.start):
        when = timestamp(note.start)
        if note.end > note.start:
            when += f"-{timestamp(note.end)}"
        lines.append(f"{when}: {line(note.text)}")
    return "\n".join(lines)


class IdeationState(TypedDict):
    prompt: str
    attempts: int
    raw: str
    items: list[dict[str, str]]


def _generate_text(prompt: str) -> str:
    with _get_client() as client:
        response = client.models.generate_content(
            model=_model(), contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        return response.text or ""


async def _generate(state: IdeationState) -> dict:
    prompt = f"{_IDEATION_SYSTEM}\n\nUser topic: {state['prompt']}"
    if state["attempts"]:
        prompt += "\n\nIMPORTANT: Respond with a JSON array only, no commentary."
    raw = await run_in_threadpool(_generate_text, prompt)
    return {"raw": raw, "attempts": state["attempts"] + 1}


def _validate(state: IdeationState) -> dict:
    return {"items": _extract_json(state["raw"])}


def _after_validation(state: IdeationState) -> str:
    return END if state["items"] or state["attempts"] >= 2 else "generate"


_ideation_builder = StateGraph(IdeationState)
_ideation_builder.add_node("generate", _generate)
_ideation_builder.add_node("validate", _validate)
_ideation_builder.add_edge(START, "generate")
_ideation_builder.add_edge("generate", "validate")
_ideation_builder.add_conditional_edges("validate", _after_validation, ["generate", END])
_ideation_graph = _ideation_builder.compile()


async def generate_ideation(prompt: str) -> list[dict[str, str]]:
    result = await _ideation_graph.ainvoke({"prompt": prompt, "attempts": 0})
    return result["items"]


class ReviewState(TypedDict):
    video_bytes: bytes
    mime: str
    ideation_context: str | None
    prompt: str
    review: str


def _prepare_review(state: ReviewState) -> dict:
    prompt = _VIDEO_REVIEW_PROMPT
    if state.get("ideation_context"):
        prompt += (
            "\n\nThe user was practicing the following script/gesture plan:\n"
            f"{state['ideation_context']}\n\nReference it specifically in your feedback."
        )
    return {"prompt": prompt}


def _review_uploaded_video(video_bytes: bytes, mime: str, prompt: str) -> str:
    # The Files API supports the application's full 50 MiB upload limit.
    # Keep resource acquisition and cleanup together, including failed reviews.
    with _get_client() as client:
        uploaded = client.files.upload(
            file=io.BytesIO(video_bytes),
            config=types.UploadFileConfig(mime_type=mime.split(";", 1)[0].strip()),
        )
        try:
            deadline = time.monotonic() + FILE_PROCESSING_TIMEOUT_SECONDS
            while uploaded.state and uploaded.state.name == "PROCESSING":
                if time.monotonic() >= deadline:
                    raise RuntimeError("Video processing timed out")
                time.sleep(1)
                uploaded = client.files.get(name=uploaded.name)
            if not uploaded.state or uploaded.state.name != "ACTIVE":
                raise RuntimeError("Video processing failed")
            for attempt in range(2):
                try:
                    response = client.models.generate_content(
                        model=_model(),
                        contents=[types.Part.from_uri(file_uri=uploaded.uri, mime_type=uploaded.mime_type), prompt],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json", response_schema=VideoReview,
                        ),
                    )
                    return _review_markdown(VideoReview.model_validate_json(response.text or ""))
                except ValidationError as exc:
                    if attempt:
                        raise RuntimeError("The model returned an incomplete review") from exc
                    prompt += "\nReturn all required fields, including at least one valid timestamped note."
                except APIError as exc:
                    if attempt or (exc.code != 429 and exc.code < 500):
                        raise
                    time.sleep(1)
        finally:
            try:
                client.files.delete(name=uploaded.name)
            except Exception:
                # Do not discard a usable review or mask the original failure.
                logger.warning("Could not delete temporary Gemini upload", exc_info=True)


async def _analyze_video(state: ReviewState) -> dict:
    review = await run_in_threadpool(
        _review_uploaded_video, state["video_bytes"], state["mime"], state["prompt"]
    )
    return {"review": review}


_review_builder = StateGraph(ReviewState)
_review_builder.add_node("prepare", _prepare_review)
_review_builder.add_node("analyze", _analyze_video)
_review_builder.add_edge(START, "prepare")
_review_builder.add_edge("prepare", "analyze")
_review_builder.add_edge("analyze", END)
_review_graph = _review_builder.compile()


async def review_video(video_bytes: bytes, mime: str, ideation_context: str | None) -> str:
    result = await _review_graph.ainvoke({
        "video_bytes": video_bytes, "mime": mime, "ideation_context": ideation_context,
    })
    return result["review"]
