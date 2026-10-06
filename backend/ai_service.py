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
    "The recording has BOTH picture and audio — watch the visual delivery AND listen to the vocal delivery.\n"
    "Review the take and give concrete, actionable feedback.\n\n"
    "Output your review in EXACTLY three sections in this order, with no other sections, no preamble, no postscript:\n\n"
    "## Strengths\n"
    "- 3 to 5 bullets highlighting what the user did well (general observations, no timestamps)\n\n"
    "## Specific Drills\n"
    "- 3 to 5 bullets describing concrete drills to practice (general, no timestamps)\n\n"
    "## Timestamped Notes\n"
    "For each specific moment that needs improvement, output a single line in this EXACT format:\n"
    "MM:SS: short recommendation\n"
    "For a span of time:\n"
    "MM:SS-MM:SS: short recommendation\n\n"
    "Examples:\n"
    "0:05: Eye contact dropped, looked down for 2 seconds\n"
    "0:23-0:35: Hands went into pockets, lost visual energy\n"
    "1:02: Voice pace slowed noticeably\n\n"
    "Give 4 to 8 timestamped notes covering the most important moments. Be specific and concise — one short sentence per note."
)


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
            response = client.models.generate_content(
                model=_model(),
                contents=[types.Part.from_uri(file_uri=uploaded.uri, mime_type=uploaded.mime_type), prompt],
            )
            review = (response.text or "").strip()
            if not review:
                raise RuntimeError("The model returned an empty review")
            return review
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
