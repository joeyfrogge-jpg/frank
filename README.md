# FRANKGPT — AI Video Generator

**Engine:** Alibaba **Wan 2.7** (text-to-video + image-to-video) via [Puter.js](https://docs.puter.com/AI/txt2vid/).

**Live:** https://joeyfrogge-jpg.github.io/frank/

Also: https://joeyfrogge-jpg.github.io/frank/iphone.html (iPhone-optimized)

## What it does

FRANKGPT turns text prompts (and optional reference photos) into short AI videos.

- Prompt + optional photo → generate
- 5s / 10s / 15s lengths
- Vertical / wide / square
- Library saved on-device (IndexedDB)
- Works in Safari, Chrome, and as installable PWA

## How to use

1. Open the site → sign in to Puter when prompted (you pay for your own generations — no API keys needed).
2. Write a prompt. Optionally add a reference photo.
3. Choose length and format.
4. Tap **→**. Video is generated with Wan 2.7 and saved to your Library.

## Files

| File | Purpose |
|------|--------|
| `iphone.html` | Main iPhone / mobile experience |
| `index.html` | Desktop / general web version |
| `standalone.html` | Hugging Face Gradio fallback (no Puter) |
| `frank.js` | Shared engine logic |
| `dual.html` | Experimental dual-model |

## GitHub Pages

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch** → `main` / root → Save

## Version

`frankgpt-1.0` (Wan 2.7)

## Notes

- No Supabase required for core functionality.
- Public feed / Explore is optional and can be added later without forced sign-in.
- For a real Android APK: wrap this PWA with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) or Capacitor.
