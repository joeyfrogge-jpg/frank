# FRANK — AI Video Generator (FRANKGPT)

**Live:** https://joeyfrogge-jpg.github.io/frank/

Make something real. Your ideas. Your videos. No boring stuff.

## What's included

| Feature | Status |
|--------|--------|
| Onboarding: **Google · Email · Phone · Guest** | Yes |
| Text → video (Wan 2.7 via Puter) | Yes |
| Image → video | Yes |
| Durations **10s / 20s / 30s** | Yes (UI; engine requests closest supported clip) |
| Library (on-device IndexedDB) | Yes |
| Explore public feed | Yes (optional JSONBin) |
| PWA (Add to Home Screen on iOS) | Yes |
| Android APK path | Yes (Bubblewrap / TWA) |
| Pricing tiers UI (Free / Plus / Premium / Platinum) | Yes |
| Surprise Me prompts | Yes |

## Sign-in options (startup screen)

1. **Continue with Google** — set `GOOGLE_CLIENT_ID` in `frank-app.js` (Google Cloud Console → OAuth Web client). Until then, a dev name prompt is used.
2. **Continue with email** — local account (email + password) on device.
3. **Continue with phone** — demo OTP (any 6-digit code after send).
4. **Continue as guest** — full create access, no account.

## Google setup (production)

1. Google Cloud Console → Credentials → Create OAuth client ID (Web).
2. Authorized JavaScript origins: `https://joeyfrogge-jpg.github.io`
3. Paste client ID into `frank-app.js`:
   ```js
   const GOOGLE_CLIENT_ID = "YOUR_ID.apps.googleusercontent.com";
   ```

## iOS

Safari → open the live URL → Share → **Add to Home Screen**.

## Android

Chrome → Install app, or build a TWA APK with Bubblewrap from the manifest.

---

**Version:** `frank-aio-3.0`
