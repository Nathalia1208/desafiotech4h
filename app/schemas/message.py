from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class MessageCreate(BaseModel):
    text: str = ""
    private_to_id: Optional[int] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        if len(v) > 2000:
            raise ValueError("Mensagem muito longa (máx 2000 caracteres)")
        return v

    def model_post_init(self, _context) -> None:
        if not self.text.strip() and not self.media_url:
            raise ValueError("Mensagem ou mídia é obrigatória")


class MessageUpdate(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Mensagem não pode ser vazia")
        if len(v) > 2000:
            raise ValueError("Mensagem muito longa (máx 2000 caracteres)")
        return v


class MessageOut(BaseModel):
    id: int
    forum_id: int
    author_id: int
    author_name: str
    text: str
    created_at: datetime
    private_to_id: Optional[int] = None
    edited_at: Optional[datetime] = None
    is_system: bool = False
    media_url: Optional[str] = None
    media_type: Optional[str] = None

    model_config = {"from_attributes": True}
