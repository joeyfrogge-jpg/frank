# frankgpt

**Turn your ideas into stunning videos.**

Free, browser-based AI text-to-video. No GPU. No paid API keys. No third-party apps.

**Live demo:** [https://joeyfrogge-jpg.github.io/frank/](https://joeyfrogge-jpg.github.io/frank/)

---

## What it does

- **Sign in** with Google, email, or continue as guest
- **Create** 10s / 20s / 30s clips from a text prompt
- **Styles:** Realistic · Cinematic · Animated · Abstract
- **Live feed** — post your creations and comment
- **Library** — clips saved on your device
- **Plans UI** — Spark (free) and upgrade tiers
- **PWA** — install to home screen; works offline for the shell

## How generation works

1. Your prompt is sent to [Pollinations](https://pollinations.ai) (free image API)
2. The still is animated in-browser with a Ken Burns effect (canvas + MediaRecorder)
3. Result is a WebM video you can save, download, or post to the feed

Rate limits on the free image path are detected and retried automatically.

## Screens

| Screen | Features |
|--------|----------|
| Sign in | Google · Email · Guest |
| Home | Live feed + My creations |
| Create | Prompt, style, duration, generate, preview |
| Plans | Spark / Maker / Director / Studio |
| Settings | Account, preferences, support, sign out |

UI matches **Wireframe Flow v0.3** (lime accent, Bricolage + Instrument Serif).

## Run locally

```bash
# any static server
npx serve .
# or
python3 -m http.server 8080
```

Open http://localhost:8080

## GitHub Pages

Settings → Pages → Deploy from branch → `main` / root.

## APK

See `.github/workflows/build-apk.yml` for the Android debug APK workflow (Capacitor / manual SDK).

## Stack

- Pure HTML / CSS / JS (no framework)
- Pollinations.ai for stills
- Canvas Ken Burns + MediaRecorder for video
- Google Identity Services (optional)
- IndexedDB / localStorage for library & feed
- Service worker for PWA install

## License

Use freely. Attribution appreciated.
