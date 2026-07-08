"""Extract the middle frame of a video as a JPEG data URI.

Used to generate session thumbnails at upload time. If anything goes wrong we
return None and the caller falls back to a placeholder.

Why direct ffmpeg instead of imageio?
WebM videos recorded in the browser use VP9, and imageio's `imread(path,
index=N)` does NOT seek properly for that codec — it silently lands on the
nearest earlier keyframe (often a black pre-roll from MediaRecorder's encoder
calibration). Going through the bundled ffmpeg binary with `-ss <time>
-vframes 1` is the only reliable way to extract a single frame at an
arbitrary timestamp.
"""
from __future__ import annotations

import asyncio
import base64
import os
import re
import subprocess
import tempfile
from typing import Optional

import imageio_ffmpeg


_THUMB_W = 320
_THUMB_H = 180
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


def _extract_sync(video_bytes: bytes, mime: str) -> Optional[str]:
    suffix = ".webm" if "webm" in mime else ".mp4"
    in_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        in_tmp.write(video_bytes)
        in_tmp.close()
        ffmpeg = _ffmpeg_exe()

        # Probe duration, then seek to the middle — clamped past the
        # ~1s black pre-roll that MediaRecorder produces.
        duration = _probe_duration(ffmpeg, in_tmp.name)
        if duration <= 0:
            seek = 1.0
        elif duration <= 2:
            seek = duration * 0.5
        else:
            seek = max(1.0, duration * 0.5)

        out_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
        out_tmp.close()
        try:
            # Slow seek: -ss AFTER -i decodes from start so we land on the
            # actual frame at that timestamp instead of the nearest keyframe.
            proc = subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-hide_banner",
                    "-loglevel", "error",
                    "-i", in_tmp.name,
                    "-ss", f"{seek:.3f}",
                    "-vframes", "1",
                    "-vf", f"scale={_THUMB_W}:{_THUMB_H}:force_original_aspect_ratio=decrease,"
                            f"pad={_THUMB_W}:{_THUMB_H}:(ow-iw)/2:(oh-ih)/2:black",
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
                jpg = f.read()
        finally:
            try:
                os.unlink(out_tmp.name)
            except OSError:
                pass

        b64 = base64.b64encode(jpg).decode("ascii")
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
