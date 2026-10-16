#!/usr/bin/env python3
"""Reference worker for FRANK_PROVIDER=local (Path A): text-to-video with Wan 2.1 via diffusers.

STATUS: reference code, NOT executed in the environment this repo was built in (no GPU there).
        Test it on your GPU box first:  python3 server/workers/wan_t2v.py --weights ... --prompt-file p.txt --out t.mp4
        It is text-to-video only, so run the server with FRANK_LOCAL_I2V=0 (image mode is then
        rejected honestly instead of silently ignoring the photo).

Needs:  pip install torch diffusers transformers accelerate imageio imageio-ffmpeg ftfy
Weights: download a *-Diffusers checkpoint, e.g. Wan-AI/Wan2.1-T2V-1.3B-Diffusers (~8-12 GB VRAM),
         into the folder you set as FRANK_WEIGHTS_DIR.

The model is loaded per clip (simple, slow start). For throughput, turn this into a long-lived
process and have FRANK_LOCAL_CMD talk to it.
"""
import argparse
import sys

p = argparse.ArgumentParser()
p.add_argument("--weights", required=True)
p.add_argument("--prompt-file", required=True)
p.add_argument("--seconds", type=int, default=5)
p.add_argument("--out", required=True)
p.add_argument("--fps", type=int, default=16)
a = p.parse_args()

import torch  # noqa: E402
from diffusers import AutoencoderKLWan, WanPipeline  # noqa: E402
from diffusers.utils import export_to_video  # noqa: E402

prompt = open(a.prompt_file, encoding="utf-8").read().strip()
vae = AutoencoderKLWan.from_pretrained(a.weights, subfolder="vae", torch_dtype=torch.float32)
pipe = WanPipeline.from_pretrained(a.weights, vae=vae, torch_dtype=torch.bfloat16).to("cuda")
frames = 4 * ((a.seconds * a.fps) // 4) + 1  # Wan wants 4k+1 frames
out = pipe(prompt=prompt, height=480, width=832, num_frames=frames, guidance_scale=5.0).frames[0]
export_to_video(out, a.out, fps=a.fps)
sys.exit(0)
