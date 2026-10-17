# FrankGPT

Free, browser-based video creator. **No GPU required.**

**Live:** https://joeyfrogge-jpg.github.io/frank/

## Features

- Guest login and Google sign-in
- Create clips: **10s / 20s / 30s**
- Styles: Realistic, Cinematic, Animated, Abstract
- Surprise-me random prompts
- Local library + community feed (when signed in with Google)
- PWA installable on phone

## How it works

Runs entirely in the browser on GitHub Pages. Images come from a free public image API (rate-limited to about one every 45 seconds). Motion is recorded in your browser. No paid API key and no server required.

## Files

```
index.html          UI
frank-app.js        App logic
config.js           Google Client ID / optional API base
manifest.json       PWA
sw.js               Service worker
icons/              App icons
terms.html          Terms
privacy.html        Privacy
docs/MODEL_SETUP.md Notes on free vs optional models
model_configs/      Model registry example
.github/workflows/  CI + APK build
```

## Local preview

```bash
python3 -m http.server 5173
# open http://127.0.0.1:5173
```

## Google sign-in

Set `GOOGLE_CLIENT_ID` in `config.js` (already set for this repo).
Authorized origin: `https://joeyfrogge-jpg.github.io`

## APK

GitHub Actions workflow builds a debug APK (Capacitor). If the workflow fails on Android SDK setup, use the website as a PWA: Share → Add to Home Screen.
