# Frank

**Frank Independent Video Intelligence & Generation Ecosystem**

Frank is a free-to-access, independently developed AI video-generation platform.
It consists of two primary workstreams:

- **Workstream A — FMIE (Frank Model Interface Engine)**  
  Software runtime, native REST API, job orchestration, media pipeline, and model contracts.

- **Workstream B — Frank Foundation Model**  
  Independently researched and trained video-generation model (architecture, data, training, evaluation).

LTX and LTX-derived systems are permanently excluded from Frank’s architecture.
Hosted third-party generation APIs (including Pollinations / Puter-based pipelines) are not used as Frank’s generation backend.

## Status (Milestone 1)

| Component | State |
|-----------|--------|
| Repository structure | Implemented |
| Native REST API (health, capabilities, models, video accept/reject) | Implemented |
| FMIE contracts & UnavailableBackend | Implemented |
| MockBackend (tests only) | Implemented |
| Hardware detection | Implemented |
| Pip-Boy / CRT terminal UI | Implemented (prototype; not connected to generation) |
| Persistent jobs / workers | Planned (M3) |
| Real Frank foundation model | Research (M4+) |
| End-to-end generation | Not available |

## Quick start

```bash
cd frank
pip install fastapi uvicorn pydantic pydantic-settings httpx python-multipart pyyaml aiofiles sqlalchemy aiosqlite pytest pytest-asyncio

PYTHONPATH=. python scripts/verify_installation.py
PYTHONPATH=. python scripts/inspect_hardware.py
PYTHONPATH=. pytest -q

uvicorn api.main:app --host 127.0.0.1 --port 8000
```

UI (static):

```bash
python -m http.server 8080 --directory frontend
# or open index.html at repo root
```

## API (Milestone 1)

| Method | Path | Purpose |
|--------|------|--------|
| GET | /health | Liveness |
| GET | /ready | Readiness |
| GET | /v1/system/capabilities | Real reported capabilities |
| GET | /v1/models | Model registry |
| POST | /v1/videos | Accept text-to-video (rejects until model exists) |

OpenAPI: `http://127.0.0.1:8000/docs`

## Design principles

- Local-first, loopback binding by default.
- Honest capability reporting — never advertise unsupported generation.
- Engine (FMIE) is separate from any trained model.
- Mock backends are for tests only and are explicitly labeled.
- No hidden third-party generation APIs.

## License

Apache-2.0. See LICENSE.
