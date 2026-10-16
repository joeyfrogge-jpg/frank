"""FRANKGPT model adapter.

One interface, swappable engines:

    adapter = get_adapter()
    adapter.health()                       -> dict (ready, gpu, weights, ...)
    adapter.generate_clip(prompt, seconds, image_path, out_path, progress_cb)

Providers (FRANK_PROVIDER):
    none       Path C. Never generates. Jobs are marked "blocked" with an honest message.
    local      Path A. Your GPU + your weights. Runs FRANK_LOCAL_CMD (see docs/ENGINE.md).
    replicate  Path B. Your Replicate account/key. Key stays on the server.
    selftest   Pipeline test only. Produces a SYNTHETIC test-pattern clip (not AI video)
               so the queue / stitch / duration code can be verified without a GPU.

Nothing here talks to any third-party service unless you configure it.
"""
import json
import os
import shlex
import shutil
import subprocess
import time
import urllib.request


class EngineBlocked(Exception):
    """Engine is not available (no GPU / weights / key). Message is shown to the user."""


class EngineError(Exception):
    """Engine was available but generation failed."""


def _run(cmd, timeout=None):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def has_ffmpeg():
    return bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def probe_duration(path):
    r = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
              "-of", "default=nw=1:nk=1", path], timeout=60)
    try:
        return float(r.stdout.strip())
    except ValueError:
        raise EngineError("Could not measure output duration (ffprobe failed).")


def gpu_present():
    if not shutil.which("nvidia-smi"):
        return False
    try:
        r = _run(["nvidia-smi", "-L"], timeout=10)
        return r.returncode == 0 and "GPU" in r.stdout
    except Exception:
        return False


class BaseAdapter:
    name = "base"
    clip_seconds = 5          # longest clip the engine can make in one call
    supports_image = True     # image-to-video available
    synthetic = False

    def health(self):
        raise NotImplementedError

    def generate_clip(self, prompt, seconds, image_path, out_path, progress_cb=None):
        raise NotImplementedError


class NoneAdapter(BaseAdapter):
    name = "none"

    def health(self):
        return {
            "provider": "none", "ready": False, "gpu": gpu_present(), "weights": False,
            "ffmpeg": has_ffmpeg(), "synthetic": False,
            "reason": "No FRANKGPT engine is online. Connect a GPU + model weights "
                      "(FRANK_PROVIDER=local) or your own inference key (FRANK_PROVIDER=replicate).",
        }

    def generate_clip(self, *a, **k):
        raise EngineBlocked(self.health()["reason"])


class LocalAdapter(BaseAdapter):
    """Path A. FRANK_LOCAL_CMD is run once per clip. Placeholders:
    {prompt_file} {image} {seconds} {out}.  Exit code 0 and a file at {out} = success."""
    name = "local"

    def __init__(self):
        self.weights_dir = os.environ.get("FRANK_WEIGHTS_DIR", "")
        self.cmd = os.environ.get("FRANK_LOCAL_CMD", "")
        self.clip_seconds = int(os.environ.get("FRANK_CLIP_SECONDS", "5"))
        self.supports_image = os.environ.get("FRANK_LOCAL_I2V", "1") == "1"
        self.timeout = int(os.environ.get("FRANK_CLIP_TIMEOUT", "1800"))

    def _weights_ok(self):
        return bool(self.weights_dir and os.path.isdir(self.weights_dir)
                    and any(os.scandir(self.weights_dir)))

    def health(self):
        gpu, weights = gpu_present(), self._weights_ok()
        reason = None
        if not gpu:
            reason = "No NVIDIA GPU detected on the FRANKGPT server."
        elif not weights:
            reason = "Model weights not found. Set FRANK_WEIGHTS_DIR to a folder with the downloaded weights."
        elif not self.cmd:
            reason = "FRANK_LOCAL_CMD is not set (the command that runs your model)."
        elif not has_ffmpeg():
            reason = "ffmpeg/ffprobe not installed on the server (needed to stitch 10/20/30s)."
        return {"provider": "local", "ready": reason is None, "gpu": gpu, "weights": weights,
                "ffmpeg": has_ffmpeg(), "synthetic": False, "clip_seconds": self.clip_seconds,
                "reason": reason}

    def generate_clip(self, prompt, seconds, image_path, out_path, progress_cb=None):
        h = self.health()
        if not h["ready"]:
            raise EngineBlocked(h["reason"])
        pf = out_path + ".prompt.txt"
        with open(pf, "w", encoding="utf-8") as f:
            f.write(prompt)
        cmd = self.cmd.format(prompt_file=shlex.quote(pf), image=shlex.quote(image_path or ""),
                              seconds=int(seconds), out=shlex.quote(out_path))
        env = dict(os.environ, FRANK_WEIGHTS_DIR=self.weights_dir)
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                               timeout=self.timeout, env=env)
        except subprocess.TimeoutExpired:
            raise EngineError("Model worker timed out.")
        finally:
            try:
                os.remove(pf)
            except OSError:
                pass
        if r.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
            raise EngineError("Model worker failed: " + (r.stderr or r.stdout or "no output")[-300:])


class ReplicateAdapter(BaseAdapter):
    """Path B. Your Replicate account. Input key names differ per model, so they are configurable."""
    name = "replicate"

    def __init__(self):
        self.token = os.environ.get("REPLICATE_API_TOKEN", "")
        self.model = os.environ.get("FRANK_REPLICATE_MODEL", "")  # "owner/name"
        self.prompt_key = os.environ.get("FRANK_REPLICATE_PROMPT_KEY", "prompt")
        self.image_key = os.environ.get("FRANK_REPLICATE_IMAGE_KEY", "image")
        self.extra = json.loads(os.environ.get("FRANK_REPLICATE_EXTRA", "{}") or "{}")
        self.clip_seconds = int(os.environ.get("FRANK_CLIP_SECONDS", "5"))
        self.timeout = int(os.environ.get("FRANK_CLIP_TIMEOUT", "900"))

    def health(self):
        reason = None
        if not self.token:
            reason = "REPLICATE_API_TOKEN is not set on the server."
        elif not self.model:
            reason = "FRANK_REPLICATE_MODEL is not set (e.g. owner/model-name)."
        elif not has_ffmpeg():
            reason = "ffmpeg/ffprobe not installed on the server (needed to stitch 10/20/30s)."
        return {"provider": "replicate", "ready": reason is None, "gpu": None, "weights": None,
                "ffmpeg": has_ffmpeg(), "synthetic": False, "clip_seconds": self.clip_seconds,
                "reason": reason}

    def _call(self, method, url, body=None):
        req = urllib.request.Request(url, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": "Bearer " + self.token,
                                              "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            raise EngineError("Inference provider error: %s" % str(e)[:200])

    def generate_clip(self, prompt, seconds, image_path, out_path, progress_cb=None):
        h = self.health()
        if not h["ready"]:
            raise EngineBlocked(h["reason"])
        inp = dict(self.extra)
        inp[self.prompt_key] = prompt
        if image_path:
            import base64
            import mimetypes
            mt = mimetypes.guess_type(image_path)[0] or "image/png"
            with open(image_path, "rb") as f:
                inp[self.image_key] = "data:%s;base64,%s" % (mt, base64.b64encode(f.read()).decode())
        pred = self._call("POST", "https://api.replicate.com/v1/models/%s/predictions" % self.model,
                          {"input": inp})
        url = pred.get("urls", {}).get("get")
        if not url:
            raise EngineError("Provider returned no prediction URL.")
        t0 = time.time()
        while time.time() - t0 < self.timeout:
            pred = self._call("GET", url)
            st = pred.get("status")
            if st == "succeeded":
                out = pred.get("output")
                out = out[0] if isinstance(out, list) and out else out
                if not isinstance(out, str):
                    raise EngineError("Provider returned no video URL.")
                with urllib.request.urlopen(out, timeout=120) as r, open(out_path, "wb") as f:
                    shutil.copyfileobj(r, f)
                return
            if st in ("failed", "canceled"):
                raise EngineError("Provider job %s: %s" % (st, str(pred.get("error"))[:200]))
            time.sleep(3)
        raise EngineError("Provider timed out.")


class SelftestAdapter(BaseAdapter):
    """SYNTHETIC. Test pattern + label. Exists only to verify queue, stitching and duration."""
    name = "selftest"
    synthetic = True

    def __init__(self):
        self.clip_seconds = int(os.environ.get("FRANK_CLIP_SECONDS", "4"))

    def health(self):
        ok = has_ffmpeg()
        return {"provider": "selftest", "ready": ok, "gpu": False, "weights": False,
                "ffmpeg": ok, "synthetic": True, "clip_seconds": self.clip_seconds,
                "reason": None if ok else "ffmpeg/ffprobe not installed."}

    def generate_clip(self, prompt, seconds, image_path, out_path, progress_cb=None):
        if not has_ffmpeg():
            raise EngineBlocked("ffmpeg/ffprobe not installed.")
        r = _run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
                  "-i", "testsrc2=size=360x640:rate=24:duration=%d" % int(seconds),
                  "-vf", "drawtext=text='FRANK SELFTEST - NOT AI':fontcolor=white:fontsize=22:x=(w-tw)/2:y=40",
                  "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", out_path],
                 timeout=120)
        if r.returncode != 0:
            raise EngineError("selftest clip failed: " + r.stderr[-200:])


def get_adapter():
    p = os.environ.get("FRANK_PROVIDER", "none").lower()
    return {"none": NoneAdapter, "local": LocalAdapter, "replicate": ReplicateAdapter,
            "selftest": SelftestAdapter}.get(p, NoneAdapter)()


# ---- multi-segment pipeline (10 / 20 / 30 s) -------------------------------------------

def last_frame(video_path, out_png):
    r = _run(["ffmpeg", "-y", "-v", "error", "-sseof", "-0.2", "-i", video_path,
              "-frames:v", "1", out_png], timeout=60)
    return r.returncode == 0 and os.path.exists(out_png)


def concat_trim(parts, target_seconds, out_path, workdir, watermark=False):
    lst = os.path.join(workdir, "concat.txt")
    with open(lst, "w") as f:
        for p in parts:
            f.write("file '%s'\n" % p.replace("'", "'\\''"))
    vf = []
    if watermark:
        vf.append("drawtext=text='FRANK':fontcolor=white@0.7:fontsize=24:x=w-tw-16:y=h-th-16")
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst,
           "-t", str(target_seconds)]
    if vf:
        cmd += ["-vf", ",".join(vf)]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-an",
            "-movflags", "+faststart", out_path]
    r = _run(cmd, timeout=900)
    if r.returncode != 0:
        raise EngineError("ffmpeg concat failed: " + r.stderr[-300:])


def render(adapter, prompt, duration, image_path, out_path, workdir, watermark, progress_cb):
    """Generate N clips, chain, stitch with ffmpeg, verify measured duration."""
    if duration not in (10, 20, 30):
        raise EngineError("duration must be 10, 20 or 30")
    clip = max(1, int(adapter.clip_seconds))
    n = -(-duration // clip)  # ceil
    parts, img = [], image_path
    for i in range(n):
        seg = os.path.join(workdir, "seg%02d.mp4" % i)
        if progress_cb:
            progress_cb(i, n, "Generating segment %d/%d" % (i + 1, n))
        adapter.generate_clip(prompt, clip, img if adapter.supports_image else None, seg)
        parts.append(seg)
        nxt = os.path.join(workdir, "last%02d.png" % i)
        img = nxt if (adapter.supports_image and last_frame(seg, nxt)) else image_path
    if progress_cb:
        progress_cb(n, n, "Stitching %d segments" % n)
    concat_trim(parts, duration, out_path, workdir, watermark)
    measured = probe_duration(out_path)
    if abs(measured - duration) > 1.0:
        raise EngineError("Output is %.1fs, expected %ds. The engine returned too little video "
                          "(%d clips x %ds)." % (measured, duration, n, clip))
    return measured
