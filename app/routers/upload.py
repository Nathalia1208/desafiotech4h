import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from ..core.dependencies import get_current_user
from ..models.user import User
from ..services import minio_client

router = APIRouter(prefix="/upload", tags=["upload"])

_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
_AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a"}
_EXT = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
}
MAX_BYTES = 15 * 1024 * 1024  # 15 MB


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type in _IMAGE_TYPES:
        media_type = "image"
    elif content_type in _AUDIO_TYPES:
        media_type = "audio"
    else:
        raise HTTPException(400, f"Tipo não suportado: {content_type}")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "Arquivo muito grande (máx 15 MB)")

    ext = _EXT.get(content_type, "bin")
    object_name = f"{uuid.uuid4()}.{ext}"

    try:
        url = minio_client.upload(data, object_name, content_type)
    except Exception as exc:
        raise HTTPException(500, f"Erro ao fazer upload: {exc}")

    return {"url": url, "media_type": media_type}
