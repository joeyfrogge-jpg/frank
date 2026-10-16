# FRANK / FRANKGPT — Standalone (no Puter)

**Guest create. Sign-in only to post on Explore. Shared feed for web + APK.**

## Product rules

| Action | Account required? |
|--------|-------------------|
| Create 10s / 20s / 30s videos | **No** |
| Browse Explore | **No** |
| Post to public feed | **Yes** (Google / Email / Phone) |
| Third-party AI (Puter etc.) | **Never** |

## Pricing (UI)

- **Free** $0 — 3 gens/day, watermark, basic models
- **Plus** $9.99 — no watermark, longer clips (20s), priority
- **Premium** $24.99 — image-to-video, style/mood, faster (MOST POPULAR)
- **Platinum** $49.99 — highest daily cap, commercial license

See `server/server.py`'s `PLANS` dict for the exact per-day limits enforced by the API.

## Model (FrankGpt-Model bundle)

- Package under `frankgpt/` + `configs/default.json`
- Backends: **Wan 2.2** and **CogVideoX**
- Weights are **not** in git — download into `models/wan2.2` / `models/cogvideox` per `configs/default.json`
- Pipeline refuses fake videos until an adapter is verified on your GPU
- Note: this package is a standalone model-dispatch layer. The live HTTP server (`server/server.py`)
  currently talks to models through its own `server/adapter.py` (`FRANK_PROVIDER=local/replicate/selftest`,
  see `docs/ENGINE.md`) rather than through `frankgpt/`. Wire `frankgpt/pipeline.py` in yourself if you want
  the API to dispatch through this package instead.

## Run API (shared feed + jobs)

```bash
python3 server/server.py
```

Open http://127.0.0.1:8000

Static GitHub Pages hosts the UI; for a **synced public feed** and real jobs, run this API on a host the app can reach.

## iOS / Android

- iOS: Safari → Add to Home Screen
- Android: Chrome Install / Bubblewrap TWA from `manifest.json`
Same Explore feed when all clients use the same API origin.

**Version:** frankgpt-standalone-1.0
