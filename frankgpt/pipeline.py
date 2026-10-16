from __future__ import annotations
from pathlib import Path

class BackendNotReady(RuntimeError):
    pass

def generate(*, backend: str, mode: str, prompt: str, image_path: str | None,
             duration: int, fps: int, output: str, config: dict, seed: int | None = None):
    """Dispatch generation to a backend adapter.

    Refuses to claim generation until an adapter has been verified
    against the exact installed checkpoint/API.
    """
    if mode not in {"t2v", "i2v"}:
        raise ValueError("mode must be 't2v' or 'i2v'")
    if not prompt.strip():
        raise ValueError("prompt cannot be empty")
    if mode == "i2v":
        if not image_path or not Path(image_path).is_file():
            raise FileNotFoundError("Image-to-video requires an existing --image file.")
    if backend not in config.get("backends", {}):
        raise ValueError(f"Unknown backend {backend!r}. Configure it in configs/default.json.")
    model_cfg = config["backends"][backend]
    local_path = Path(model_cfg.get("local_path", ""))
    model_id = model_cfg.get("model_id", "")
    if not local_path.exists() and not model_id:
        raise FileNotFoundError(f"No local path or model ID configured for {backend}.")
    raise BackendNotReady(
        f"The {backend} adapter has not been verified for this installed checkpoint/API. "
        "No video was generated. Place weights under models/wan2.2, implement the verified "
        "adapter, then retry. See STANDALONE.md and docs/MODEL_CARD.md."
    )
