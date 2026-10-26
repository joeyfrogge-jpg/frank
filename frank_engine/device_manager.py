"""Hardware and device detection for Frank."""

from __future__ import annotations

import os
import platform
import shutil
from typing import Any


def detect_hardware() -> dict[str, Any]:
    mem_total_mb = _read_mem_total_mb()
    disk = shutil.disk_usage(os.getcwd())
    info: dict[str, Any] = {
        "os": platform.system(),
        "os_release": platform.release(),
        "arch": platform.machine(),
        "python_version": platform.python_version(),
        "cpu_count": os.cpu_count() or 1,
        "memory_total_mb": mem_total_mb,
        "disk_total_gb": round(disk.total / (1024**3), 2),
        "disk_free_gb": round(disk.free / (1024**3), 2),
        "cuda_available": False,
        "gpu": None,
        "recommended_device": "cpu",
        "notes": [],
    }
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            gpus = []
            for line in result.stdout.strip().splitlines():
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 2:
                    gpus.append({"name": parts[0], "memory_mb": parts[1]})
            if gpus:
                info["gpu"] = gpus
                info["cuda_available"] = True
                info["recommended_device"] = "cuda"
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        info["notes"].append("nvidia-smi not available or failed")
    if info["memory_total_mb"] and info["memory_total_mb"] < 4096:
        info["notes"].append(
            "Low system memory (<4 GB). Full-scale video model training and inference are not feasible."
        )
    if not info["cuda_available"]:
        info["notes"].append("No CUDA GPU detected. Inference will be CPU-only when a model exists.")
    return info


def _read_mem_total_mb() -> int | None:
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) // 1024
    except (OSError, ValueError, IndexError):
        pass
    return None
