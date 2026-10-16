# FRANK — AI video generator (FRANKGPT)

**Version `frankgpt-standalone-1.0` — standalone, no Puter.** Everything runs under your control:
your UI, your API (`server/`), your model path, your accounts.

Live UI: https://joeyfrogge-jpg.github.io/frank/ (needs your backend to generate — see below)

## What you get

| Piece | Where | Status |
|---|---|---|
| UI / PWA (iOS + Android install) | `index.html`, `frank-app.js`, `config.js`, `sw.js`, `manifest.json` | ✅ |
| Sign-in: Google · Email · Phone · Guest | UI + `server/server.py` | ✅ Email/Guest work out of the box. Google needs `GOOGLE_CLIENT_ID`; Phone needs Twilio Verify. |
| Job API (`/api/v1/generations`, `/library`, `/feed`, `/health`) | `server/server.py` (stdlib + SQLite) | ✅ |
| Model adapter + 10/20/30 s stitching (FFmpeg) | `server/adapter.py` | ✅ pipeline tested; ⚠️ real models need your GPU or key |
| Explore feed | your DB (`feed` table) | ✅ |
| Stripe plans + limits | `server/server.py` | ✅ code + signature-verified webhook tested; ⚠️ needs your Stripe keys |
| Terms / Privacy | `terms.html`, `privacy.html` | ✅ template — have it reviewed |
| APK | `.github/workflows/build-apk.yml` | ✅ workflow; ⚠️ not built/installed on a device yet |

## Honest generation

If no model is online, creating a video returns a job with status **blocked**:
*“Queued — connect FRANKGPT server + GPU to generate.”* It never fakes progress.
Pick one engine (`FRANK_PROVIDER`): `local` (your GPU), `replicate` (your key), or `none`. Details: [docs/ENGINE.md](docs/ENGINE.md).

## Run it (2 minutes)

```bash
python3 server/server.py            # serves the UI + API on http://localhost:8000
```
Open http://localhost:8000 → Continue as guest → create. Without an engine you will see the honest
“engine offline” message. To see the whole pipeline work with a synthetic test pattern (not AI):

```bash
FRANK_PROVIDER=selftest python3 server/server.py     # needs ffmpeg
```

Full configuration: [docs/BACKEND.md](docs/BACKEND.md) · Phones/APK: [docs/MOBILE.md](docs/MOBILE.md)

## Tests

```bash
python3 -m unittest discover -s server/tests -v
```

## Layout

```
index.html frank-app.js config.js sw.js manifest.json icons/   the app
terms.html privacy.html                                          legal
server/server.py server/adapter.py server/workers/               your backend
docs/                                                            how-tos
```
