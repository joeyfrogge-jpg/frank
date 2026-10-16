from __future__ import annotations
import json
from pathlib import Path

def load_config(path: str | Path = "configs/default.json") -> dict:
    config_path = Path(path)
    if not config_path.is_file():
        raise FileNotFoundError(f"Config file not found: {config_path}")
    data = json.loads(config_path.read_text(encoding="utf-8"))
    if data.get("default_backend") not in data.get("backends", {}):
        raise ValueError("default_backend must match a key under backends")
    durations = data.get("allowed_durations_seconds", [])
    if not durations or any(not isinstance(x, int) or x <= 0 for x in durations):
        raise ValueError("allowed_durations_seconds must be a list of positive integers")
    return data
