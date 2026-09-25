# SafeSec Agents — backend
#
# Production image for the FastAPI service. Note the final image is a few
# GB because `sentence-transformers` pulls in a CPU build of torch for the
# local judge-cache embeddings — that's expected, not a mistake.
#
# Build:
#   docker build -t safesec-agents-backend .
# Run:
#   docker run --rm -p 8000:8000 --env-file .env safesec-agents-backend

FROM python:3.11-slim

WORKDIR /app

# Keep Python from writing .pyc files / buffering stdout, and skip pip's
# version-check network call on every invocation.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

# libgomp1 is required at runtime by torch's CPU backend.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run / most PaaS providers inject $PORT at runtime; Render/Fly/Railway
# all respect this convention too.
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
