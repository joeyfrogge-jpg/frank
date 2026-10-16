# FRANKGPT engine — pick ONE path

Set `FRANK_PROVIDER`. `GET /api/v1/health` tells you whether it is ready and, if not, exactly why.

## Path C — `none` (default): honest “not ready”
No GPU/key yet. Every job is created as **blocked** with “connect FRANKGPT server + GPU to generate”.

## Path A — `local`: your GPU, zero per-video fees
Needs an NVIDIA GPU (≈8 GB VRAM for Wan 2.1 1.3B, 24 GB+ for larger models), downloaded weights, ffmpeg.

```bash
FRANK_PROVIDER=local
FRANK_WEIGHTS_DIR=/models/Wan2.1-T2V-1.3B-Diffusers
FRANK_LOCAL_I2V=0               # the example worker is text-to-video only
FRANK_CLIP_SECONDS=5            # longest clip your model makes in one call
FRANK_LOCAL_CMD='python3 server/workers/wan_t2v.py --weights $FRANK_WEIGHTS_DIR --prompt-file {prompt_file} --seconds {seconds} --out {out}'
```
`FRANK_LOCAL_CMD` is run once per clip; placeholders `{prompt_file} {image} {seconds} {out}`. Exit 0 and write an MP4 to `{out}`.
Any model can be plugged in this way without touching the UI. `server/workers/wan_t2v.py` is a **reference
worker that has not been run on a GPU yet** — test it on your machine first.

## Path B — `replicate`: your account, your key (server-side only)
```bash
FRANK_PROVIDER=replicate
REPLICATE_API_TOKEN=r8_...
FRANK_REPLICATE_MODEL=owner/model-name
FRANK_REPLICATE_PROMPT_KEY=prompt      # input field names differ per model
FRANK_REPLICATE_IMAGE_KEY=image
FRANK_REPLICATE_EXTRA='{"aspect_ratio":"9:16"}'
```
**Not tested against the live Replicate API yet** (no account in the build environment). The browser never sees the key.

## How 10 / 20 / 30 s works
The API accepts only 10, 20, 30. If the engine's clip is shorter (`FRANK_CLIP_SECONDS`), the server makes
`ceil(duration / clip)` segments (feeding each segment's last frame to the next when the engine supports images),
concatenates them with ffmpeg, trims to the target, and **measures the result with ffprobe**. If the measured length is
more than 1 s off, the job fails instead of delivering a short video. The UI shows “Segment 2/3”.

## `selftest`
`FRANK_PROVIDER=selftest` makes a synthetic test-pattern clip labelled “NOT AI”. It exists only to prove the queue,
stitching and duration logic (the automated tests use it). Never leave it on in production — the app shows a TEST ENGINE badge.
