// FRANK runtime config. Edit this file (or use Settings -> FRANKGPT server) to point the app at YOUR backend.
//
// API_BASE
//   ""                       same origin. Use when server/server.py also serves this UI
//                            (python3 server/server.py -> http://localhost:8000).
//   "https://api.yourdomain" UI on GitHub Pages / APK, API on your host or tunnel.
//                            That origin must be listed in FRANK_CORS_ORIGINS on the server.
//
// Google sign-in needs no value here: the server publishes its GOOGLE_CLIENT_ID via /api/v1/health.
window.FRANK_CONFIG = {
  API_BASE: ""
};
