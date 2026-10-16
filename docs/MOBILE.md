# iPhone & Android

## iOS (PWA)
Open your URL in **Safari → Share → Add to Home Screen**. PNG icons (`icons/apple-touch-icon.png`), safe-area
padding and the camera picker for reference photos are already set up. The URL must be HTTPS and reach your API
(add its origin to `FRANK_CORS_ORIGINS` if the API is on another host).

## Android — install from Chrome
Chrome → ⋮ → **Install app** (works because of `manifest.json` + `sw.js` + PNG icons).

## Android — APK (GitHub Actions)
1. Repo → **Settings → Secrets and variables → Actions → Variables** → add `FRANK_API_BASE` = `https://your-api.example`
   (or enter it each time you run the workflow).
2. **Actions → Build FRANK APK → Run workflow** (enter `api_base`).
3. Download artifact `frank-debug-apk` → install `app-debug.apk` (allow “install unknown apps”).

The APK bundles the UI and talks only to the API you configured; no other origin is needed. The API must send CORS
headers for `https://localhost` / `capacitor://localhost` (included by default). It is a **debug** build — signing and
Play Store upload are separate steps. App icon in the APK is Capacitor's default until you add one (`@capacitor/assets`).
