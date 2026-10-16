# Backend (`server/server.py`)

Python 3.9+ standard library only (no pip install). SQLite database and generated MP4s live in `server/data/`
(override with `FRANK_DATA`). Needs `ffmpeg` + `ffprobe` on the PATH for 10/20/30 s output.

```bash
cp .env.example .env     # edit
set -a; . ./.env; set +a
python3 server/server.py
```

## API (all under `/api/v1`)

| Method & path | Auth | Notes |
|---|---|---|
| `GET /health` | – | `ready`, `engine{provider,gpu,weights,ffmpeg,reason}`, `features{google,phone,billing}` |
| `POST /auth/register` `/auth/login` | – | email + password (≥8), scrypt-hashed, 30-day session token |
| `POST /auth/google` | – | `{credential}`; verified against Google, `aud` must equal `GOOGLE_CLIENT_ID` |
| `POST /auth/phone/start` `/auth/phone/verify` | – | Twilio Verify; `501` until configured |
| `GET/DELETE /auth/me`, `POST /auth/logout` | token | `DELETE` removes account + videos + posts |
| `POST /generations` | optional | `{prompt, duration: 10|20|30, mode: t2v|i2v, aspect, reference_image(data URL)}` → job |
| `GET /generations/:id` · `/video` | owner | job status / MP4 (Range supported) |
| `GET /library` | optional | your jobs |
| `GET/POST /feed`, `DELETE /feed/:id`, `GET /feed/:id/video` | read: public, post: token | Explore |
| `POST /billing/checkout` `/billing/portal` | token | Stripe |
| `POST /billing/webhook` | Stripe signature | sets `plan` on the user row |

Job `status`: `queued` → `running` → `succeeded` | `failed` | `blocked` (engine not ready — message says why).
`segment_done / segment_total` drive the “Segment 2/3” UI.

## Plan limits (enforced here, not in the browser)

| | Guest | Free | Plus | Premium | Platinum |
|---|---|---|---|---|---|
| Videos/day | 2 | 3 | 20 | 50 | 500 |
| Max length | 10s | 10s | 20s | 30s | 30s |
| Image-to-video | – | – | – | ✓ | ✓ |
| Watermark | ✓ | ✓ | – | – | – |

Edit `PLANS` in `server/server.py` to change them (and the pricing cards in `index.html`).

## Environment

See `.env.example`. Key ones: `FRANK_PROVIDER`, `FRANK_CORS_ORIGINS` (add your Pages/APK origins),
`FRANK_PUBLIC_URL`, `GOOGLE_CLIENT_ID`, `TWILIO_*`, `STRIPE_*`, `FRANK_RETENTION_DAYS`, `FRANK_STORAGE_CAP_MB`,
`FRANK_TRUST_PROXY=1` behind a tunnel/proxy.

## Google sign-in
1. Google Cloud Console → Credentials → OAuth client ID → **Web**.
2. Authorized JavaScript origins: `https://joeyfrogge-jpg.github.io` (+ `http://localhost:8000`, your domain).
3. Set `GOOGLE_CLIENT_ID` on the **server**. The app reads it from `/health`; nothing to paste in the frontend.

## Stripe
1. Create three recurring prices (Plus $9.99, Premium $24.99, Platinum $49.99 — match the cards) → `STRIPE_PRICE_*`.
2. Webhook endpoint `https://YOUR-API/api/v1/billing/webhook`, events: `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted` → `STRIPE_WEBHOOK_SECRET`.
3. `STRIPE_SECRET_KEY`, `FRANK_PUBLIC_URL`. Test with Stripe test keys + `stripe listen`.

## Putting it online
- **Same host (simplest):** run `server.py` behind Cloudflare Tunnel / Caddy / nginx (HTTPS). It serves the UI too.
- **UI on GitHub Pages + API elsewhere:** put your API URL in `config.js` (`API_BASE`) or in the app’s
  *More → FRANKGPT server*, and add `https://joeyfrogge-jpg.github.io` to `FRANK_CORS_ORIGINS`.
- Always HTTPS in production (Pages is HTTPS, so the API must be too).
