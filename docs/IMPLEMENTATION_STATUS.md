# Implementation Status

**Workspace:** https://github.com/joeyfrogge-jpg/frank (main)

**Last updated:** GitHub migration of Milestone 1 foundation

## On GitHub main

| Item | Status |
|------|--------|
| Independent README / LICENSE / pyproject | Done |
| Removed Puter/Pollinations app (frank-app.js, config.js, sw.js) | Done |
| Pip-Boy UI (index.html, styles.css, app.js, assets/cow.svg) | Done |
| frontend/ copy of UI | Done |
| FMIE contracts, engine, UnavailableBackend, MockBackend | Done |
| API main, errors, dependencies, health/system/videos routes | Done |
| API schemas (system, jobs, videos, assets) | Done |
| configs/*.yaml | Done |
| Tests / full docs set | Partial (local complete) |

## Capability honesty

- Default backend: unavailable
- POST /v1/videos rejects with 503 until a Frank model exists
- UI Generate button does not fake video

## Non-claims

- No real AI video generation
- No hosted generation APIs as Frank backend
- No LTX

## Next

Milestone 3 — persistent jobs, queue, worker, cancellation.
