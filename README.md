# FRANK — AI Video Generator

**Engine:** OpenAI **Sora 2** via [Puter.js](https://docs.puter.com/AI/txt2vid/) (single model, no multi-model pipeline).

**Live (enable Pages first):** https://joeyfrogge-jpg.github.io/frank/

Also available on: https://joeyfrogge-jpg.github.io/reelriot/

## How it works

1. Open the site → allow **Puter** sign-in when prompted (User-Pays credits).
2. Write a prompt and optionally **Add Reference**.
3. Pick **5s / 10s / 20s** (locked when you hit Generate).
4. Tap **→** — FRANK calls `puter.ai.txt2vid` with `model: "openai/sora-2"`.
5. Video saves to **Library** on this device (IndexedDB).

## GitHub Pages

1. **Settings → Pages** on this repo  
2. Source: **Deploy from a branch** → `main` / `/` (root) → Save  

## Explore (optional)

Supabase table `frank_explore` + anon key in Settings. Leave empty for an empty Explore (no fake posts).

## Version

`frank-sora-2.0`
