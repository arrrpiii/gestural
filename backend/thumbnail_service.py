"""Extract a single random frame from a video and return it as a JPEG data URI.

Used to generate session thumbnails at upload time. If anything goes wrong we
return None and the caller falls back to a placeholder.

Why direct ffmpeg instead of imageio/v3?

WebM videos recorded in the browser use VP9, and imageio's `imread(path,
index=N)` does NOT seek properly for that codec — it silently returns the
first keyframe (which is often a black pre-roll from MediaRecorder's encoder
calibration), giving us a black thumbnail. Going through the bundled ffmpeg
binary with `-ss <time> -vframes 1` is the only reliable way to extract a
single frame at an arbitrary timestamp.

Why multiple candidates?

A single seek might land on a frame where the user blinked, looked away, or
where the encoder was still calibrating. We extract several candidates and
pick the one with the most visible content (highest mean luminance) so the
thumbnail is almost always a real, recognisable frame.
"""
from __future__ import annotations

import asyncio
import base64
import io
import os
import random
import re
import subprocess
import tempfile
from typing import Optional

import imageio_ffmpeg
from PIL import Image


_THUMB_W = 320
_THUMB_H = 180
_JPEG_QUALITY = 70
_DURATION_RE = re.compile(rb"Duration:\s*(\d+):(\d+):(\d+\.\d+)")


def _ffmpeg_exe() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def _probe_duration(ffmpeg: str, input_path: str) -> float:
    """Return the duration of the file in seconds, parsed from ffmpeg's stderr."""
    try:
        proc = subprocess.run(
            [ffmpeg, "-hide_banner", "-i", input_path, "-f", "null", "-"],
            capture_output=True,
            timeout=15,
        )
    except Exception:
        return 0.0
    m = _DURATION_RE.search(proc.stderr or b"")
    if not m:
        return 0.0
    h, mn, s = (float(x) for x in m.groups())
    return h * 3600 + mn * 60 + s


def _extract_frame_bytes(ffmpeg: str, input_path: str, seek_to: float) -> Optional[bytes]:
    """Extract a single JPEG frame at the given timestamp. Returns bytes or None."""
    out_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    out_tmp.close()
    try:
        # Slow seek: -ss AFTER -i decodes from start so we land on the actual
        # frame at that timestamp instead of the nearest earlier keyframe.
        proc = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-hide_banner",
                "-loglevel", "error",
                "-i", input_path,
                "-ss", f"{seek_to:.3f}",
                "-vframes", "1",
                "-vf", f"scale={_THUMB_W}:{_THUMB_H}:force_original_aspect_ratio=decrease,"
                        f"pad={_THUMB_W}:{_THUMB_H}:(ow-iw)/2:(oh-ih)/2:black,"
                        f"format=yuv420p",
                "-q:v", str(max(2, min(31, 31 - _JPEG_QUALITY // 3))),
                out_tmp.name,
            ],
            capture_output=True,
            timeout=30,
        )
        if proc.returncode != 0 or not os.path.exists(out_tmp.name):
            return None
        if os.path.getsize(out_tmp.name) == 0:
            return None
        with open(out_tmp.name, "rb") as f:
            return f.read()
    except Exception:
        return None
    finally:
        try:
            os.unlink(out_tmp.name)
        except OSError:
            pass


def _brightness(jpeg_bytes: bytes) -> float:
    """Return mean luminance (0–255) of a JPEG; 0 if it can't be decoded."""
    try:
        img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
        # Downsample to keep this fast on long videos.
        img.thumbnail((64, 64))
        # Quick average over all pixels.
        total = 0
        count = 0
        for r, g, b in img.getdata():
            # Rec. 601 luminance
            total += (r * 299 + g * 587 + b * 114) // 1000
            count += 1
        return total / count if count else 0.0
    except Exception:
        return 0.0


def _candidate_timestamps(duration: float) -> list[float]:
    """Build a list of candidate seek points, biased toward the middle/late
    portion of the clip so we avoid MediaRecorder's ~1s black pre-roll."""
    if duration <= 0:
        # No duration info — try a couple of fixed offsets and hope.
        return [1.0, 2.0, 0.5]
    if duration <= 1.5:
        # Very short clip — just grab what's there.
        return [duration * 0.5, duration * 0.3, duration * 0.7]
    # Long enough to skip the pre-roll — try 25/40/55/70% of the clip.
    base = max(1.0, duration * 0.25)
    spread = [
        duration * 0.25,
        duration * 0.40,
        duration * 0.55,
        duration * 0.70,
    ]
    # Clamp lower bound to skip pre-roll.
    return [max(base, s) for s in spread]


def _extract_sync(video_bytes: bytes, mime: str) -> Optional[str]:
    suffix = ".webm" if "webm" in mime else ".mp4"
    in_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        in_tmp.write(video_bytes)
        in_tmp.close()
        ffmpeg = _ffmpeg_exe()

        duration = _probe_duration(ffmpeg, in_tmp.name)
        candidates = _candidate_timestamps(duration)
        random.shuffle(candidates)

        best_bytes: Optional[bytes] = None
        best_brightness = 0.0
        for ts in candidates:
            jpg = _extract_frame_bytes(ffmpeg, in_tmp.name, ts)
            if not jpg:
                continue
            lum = _brightness(jpg)
            if lum > best_brightness:
                best_brightness = lum
                best_bytes = jpg
            # Good enough — stop early.
            if lum > 60:
                break

        if best_bytes is None or best_brightness < 8:
            # All candidates were too dark to be useful.
            return None

        b64 = base64.b64encode(best_bytes).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"
    except Exception:
        return None
    finally:
        try:
            os.unlink(in_tmp.name)
        except OSError:
            pass


async def extract_thumbnail(video_bytes: bytes, mime: str) -> Optional[str]:
    """Run the (blocking) extraction in a worker thread."""
    return await asyncio.to_thread(_extract_sync, video_bytes, mime)