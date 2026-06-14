from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from .user import UserOut


class ForumCreate(BaseModel):
    name: str
    description: str = ""

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Nome não pode ser vazio")
        if len(v) > 100:
            raise ValueError("Nome muito longo (máx 100 caracteres)")
        return v


class ForumUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    featured: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Nome não pode ser vazio")
        if len(v) > 100:
            raise ValueError("Nome muito longo (máx 100 caracteres)")
        return v


class ForumOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    created_by: int
    created_at: datetime
    featured: bool = False
    # Include creator user object so frontend can show the creator name
    creator: Optional[UserOut] = None
    participants_count: int = 0

    model_config = {"from_attributes": True}


class ParticipantOut(BaseModel):
    id: int
    username: str
    email: str
    avatar_url: str | None = None
    color: str
    created_at: datetime
    online: bool
    data_entrada: datetime | None = None
    is_admin: bool = False

    model_config = {"from_attributes": True}
