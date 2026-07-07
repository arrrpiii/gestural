"""Wrapper around the agno library (Gemini 2.5 Flash) for two jobs:
  1. Ideation: turn a user prompt into a JSON list of {text, gesture} pairs.
  2. Video review: analyze a recorded practice video and return coaching feedback.
"""
from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

from agno.agent import Agent
from agno.media import Video
from agno.models.google import Gemini
from dotenv import load_dotenv
from fastapi.concurrency import run_in_threadpool

load_dotenv()

_agent: Agent | None = None


def _get_agent() -> Agent:
    """Lazily build a single Agent. Constructed once, reused across requests.

    `agent.run()` is sync, so per-request calls are wrapped in `run_in_threadpool`
    by the caller. We keep one instance because Agent construction is expensive.
    """
    global _agent
    if _agent is None:
        if not os.getenv("GOOGLE_API_KEY"):
            raise RuntimeError("GOOGLE_API_KEY is not set in environment")
        _agent = Agent(
            model=Gemini(id="gemini-2.5-flash"),
            markdown=True,
        )
    return _agent


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
        text_v = str(item.get("text", "")).strip()
        gesture_v = str(item.get("gesture", "")).strip()
        if text_v and gesture_v:
            cleaned.append({"text": text_v, "gesture": gesture_v})
    return cleaned


async def generate_ideation(prompt: str) -> list[dict[str, str]]:
    """Generate script + gesture pairs for a content creator's idea."""
    agent = _get_agent()
    full_prompt = f"{_IDEATION_SYSTEM}\n\nUser topic: {prompt}"

    def _call() -> str:
        response = agent.run(full_prompt, stream=False)
        return getattr(response, "content", "") or ""

    raw = await run_in_threadpool(_call)
    items = _extract_json(raw)
    if items:
        return items
    # One retry with a stronger "JSON only" reminder if the first pass failed.
    retry_prompt = full_prompt + "\n\nIMPORTANT: Respond with a JSON array only, no commentary."

    def _retry() -> str:
        response = agent.run(retry_prompt, stream=False)
        return getattr(response, "content", "") or ""

    raw2 = await run_in_threadpool(_retry)
    return _extract_json(raw2)


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


async def review_video(video_bytes: bytes, mime: str, ideation_context: str | None) -> str:
    """Send recorded video to Gemini and return markdown feedback."""
    agent = _get_agent()
    suffix = ".webm" if "webm" in mime else ".mp4"
    # Write to a temp file because agno's Video wrapper needs a real path.
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(video_bytes)
        tmp.close()
        prompt = _VIDEO_REVIEW_PROMPT
        if ideation_context:
            prompt += (
                "\n\nThe user was practicing the following script/gesture plan:\n"
                f"{ideation_context}\n\nReference it specifically in your feedback."
            )

        def _call() -> str:
            response = agent.run(
                prompt,
                videos=[Video(filepath=Path(tmp.name))],
                stream=False,
            )
            return getattr(response, "content", "") or ""

        return await run_in_threadpool(_call)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
