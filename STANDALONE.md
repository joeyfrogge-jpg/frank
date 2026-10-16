# FRANK / FRANKGPT — Standalone (no Puter)

**Guest create. Sign-in only to post on Explore. Shared feed for web + APK. Admin via master link.**

## Product rules

| Action | Account required? |
|--------|-------------------|
| Create 10s / 20s / 30s videos | **No** |
| Browse Explore | **No** |
| Post to public feed | **Yes** (Google / Email / Phone) |
| Third-party AI (Puter etc.) | **Never** |

## Pricing (UI)

- **Free** $0 — 3–5 gens/day, watermark, basic models
- **Plus** $9.99 — no watermark, longer clips, priority
- **Premium** $24.99 — image-to-video, style/mood, faster (MOST POPULAR)
- **Platinum** $49.99 — unlimited, commercial, master-link benefits

## Master admin (free unlimited + moderator)

Open:

```
https://YOUR-SITE/?master=FRANK-MASTER-2026
```

Then sign in with Google or Email. That account becomes **admin / moderator / Platinum** (free).

Change the token with env `FRANK_MASTER_TOKEN`.

## Model (FrankGpt-Model bundle)

- Package under `frankgpt/` + `configs/default.json`
- Backends: **Wan 2.2** and **CogVideoX**
- Weights are **not** in git — download into `models/wan2.2` (see `docs/MODEL_CARD.md`)
- Pipeline refuses fake videos until adapter is verified on your GPU

## Run API (shared feed + jobs)

```bash
python3 api/server.py
```

Open http://127.0.0.1:8000

Static GitHub Pages hosts the UI; for a **synced public feed** and real jobs, run this API on a host the app can reach.

## iOS / Android

- iOS: Safari → Add to Home Screen
- Android: Chrome Install / Bubblewrap TWA from `web/manifest.json`
Same Explore feed when all clients use the same API origin.

**Version:** 2.0.0-standalone
