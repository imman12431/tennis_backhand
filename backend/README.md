---
title: Tennis Backhand Detector API
emoji: 🎾
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Tennis Backhand Detector — API

FastAPI backend that detects and extracts tennis backhand shots from match
videos using a pose-based classification pipeline (MediaPipe Pose →
TensorFlow/Keras classifier → rejector model → clip export via OpenCV/FFmpeg).

This Space serves the **API only**; the user-facing UI is a separate Next.js
app (deployed on Vercel) that calls these endpoints.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/health` | Liveness check (uptime pinger target) |
| `GET`  | `/demos` | List built-in demo videos |
| `POST` | `/detect` | Submit a job: multipart `file` (mp4) **or** form field `demo=<id>` → `{job_id}` |
| `GET`  | `/status/{job_id}` | Poll status + progress logs + result clip names |
| `GET`  | `/clips/{job_id}/{filename}` | Download/stream a detected clip |

Detection runs asynchronously in a background thread (serialized so the small
container isn't overwhelmed). Job state is in memory and cleared after 1 hour.

## Config (env vars)

- `ALLOWED_ORIGINS` — comma-separated CORS origins (set this to your Vercel URL).
- `JOBS_DIR` — where per-job working dirs are written (default `/tmp/tennis_jobs`).

## Local run

```bash
uv sync --frozen
uv run uvicorn main:app --reload --port 7860
# or via Docker:
docker build -t tennis-api .
docker run -p 7860:7860 tennis-api
```
