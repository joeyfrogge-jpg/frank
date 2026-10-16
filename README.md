# FRANKGPT — AI Video Generator

**Product brand:** FRANKGPT  
**Engine (live):** Alibaba **Wan 2.7** text-to-video + image-to-video via [Puter.js](https://docs.puter.com/AI/txt2vid/)  
**No Supabase.** Library is on-device. Explore can be local or upgraded later.

**Live:** https://joeyfrogge-jpg.github.io/frank/

---

## Why not “exactly Sora”?

OpenAI shut down the **Sora API on September 24, 2026**. There is no official Sora endpoint left.

Training a new foundation model from scratch at Sora quality is not something that can be done in a web app repo — it requires massive GPU clusters and datasets.

**FRANKGPT** is the product name. Under the hood it uses the best *available* production models (currently Wan 2.7 on Puter). The engine is isolated in `frankgpt-engine.js` so we can swap or add providers (Seedance, MiniMax H3, Kling, Veo, etc.) when you have API keys.

---

## What works today

| Feature | Status |
|--------|--------|
| Text → video | ✅ FRANKGPT / Wan 2.7 |
| Image → video | ✅ FRANKGPT / Wan 2.7 |
| No API keys for you (user-pays Puter) | ✅ |
| No Supabase | ✅ |
| On-device Library | ✅ |
| Explore (local share) | ✅ skeleton |
| PWA installable | ✅ |
| Google sign-in gate | ✅ structure (needs your Client ID) |
| Memberships | Skeleton only |

---

## Files

| File | Purpose |
|------|--------|
| `index.html` | Main app (design aligned to your screenshots) |
| `frankgpt-engine.js` | **FRANKGPT** generation engine |
| `manifest.json` + `sw.js` | PWA |
| `iphone.html` | Earlier mobile single-file |
| `standalone.html` | HF Gradio fallback |

---

## How generation works

1. User opens site → Google gate (or Dev skip for testing).
2. Prompt + optional reference photo.
3. **FRANKGPT** calls Puter `txt2vid` with Wan 2.7 T2V or I2V.
4. Video saved to IndexedDB Library.
5. Optional “Share to Explore” (local for now).

---

## Master link

`https://joeyfrogge-jpg.github.io/frank/?master=FRANK-MASTER-2026`  
After sign-in, grants Platinum / unlimited flag (payments still skeleton).

---

## Next (when you’re ready)

1. Paste your **Google OAuth Client ID** into `index.html`.
2. Wire real **Stripe** for Plus / Premium / Platinum.
3. Optional: add a second provider (e.g. Seedance / MiniMax) behind FRANKGPT when you have keys.
4. APK via Bubblewrap from the PWA.

---

**Version:** `frankgpt-1.0`
