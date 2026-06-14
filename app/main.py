from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .core.config import settings
from .database import Base, engine

from .models import forum, message, user  # noqa: F401
from .routers import auth, forums, messages, upload, users, ws
from .services import minio_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Add is_system column to mensagens if it doesn't exist yet
    with engine.connect() as conn:
        def _col_exists(table: str, column: str) -> bool:
            r = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
            ), {"t": table, "c": column})
            return r.scalar() > 0

        if not _col_exists("mensagens", "is_system"):
            conn.execute(text("ALTER TABLE mensagens ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0"))
        if not _col_exists("mensagens", "media_url"):
            conn.execute(text("ALTER TABLE mensagens ADD COLUMN media_url VARCHAR(500) NULL"))
        if not _col_exists("mensagens", "media_type"):
            conn.execute(text("ALTER TABLE mensagens ADD COLUMN media_type VARCHAR(20) NULL"))
        conn.commit()

    try:
        minio_client.ensure_bucket()
    except Exception:
        pass

    yield


app = FastAPI(title="Tech4UM API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(forums.router)
app.include_router(messages.router)
app.include_router(upload.router)
app.include_router(users.router)
app.include_router(ws.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
