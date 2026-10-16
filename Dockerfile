# One container = UI + API + ffmpeg. Deploy to Render / Fly.io / Railway / Cloud Run / a VPS.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . /app
ENV FRANK_HOST=0.0.0.0 FRANK_DATA=/data PYTHONUNBUFFERED=1 FRANK_TRUST_PROXY=1
VOLUME /data
EXPOSE 8000
CMD ["python3", "server/server.py"]
