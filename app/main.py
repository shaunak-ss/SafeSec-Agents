from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.redis_client import close_redis_client
from app.models.db import init_db
from app.routers import health, scans


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_redis_client()


app = FastAPI(title="SafeSec Agents API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(scans.router)
