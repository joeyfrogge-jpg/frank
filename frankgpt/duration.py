from __future__ import annotations

ALLOWED = (10, 20, 30)

def frames_for(seconds: int, fps: int) -> int:
    if seconds not in ALLOWED:
        raise ValueError(f"duration must be one of {ALLOWED}")
    if fps <= 0:
        raise ValueError("fps must be positive")
    return int(seconds) * int(fps)

def describe_duration(seconds: int, fps: int) -> str:
    n = frames_for(seconds, fps)
    return f"FrankGPT duration plan: {seconds}s at {fps} FPS = {n} frames"
