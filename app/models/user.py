from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .forum import Forum
    from .message import Message


_COLORS = ["#e57373", "#64b5f6", "#81c784", "#ffd54f", "#ba68c8", "#4db6ac", "#ff8a65", "#90a4ae"]


def compute_color(user_id: str) -> str:
    h = 0
    for c in user_id:
        h = (h * 31 + ord(c)) & 0xFFFF
    return _COLORS[h % len(_COLORS)]


class User(Base):
    # map to existing legacy table `usuarios`
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, name="nome_usuario")
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False, name="senha_hash")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), name="data_criacao"
    )
    # legacy table does not have a 'color' column; compute it on the fly

    @property
    def color(self) -> str:
        return compute_color(str(self.id))
    # optional avatar_url exists in legacy table but not used by the app fields directly

    forums: Mapped[list["Forum"]] = relationship(
        "Forum", back_populates="creator", foreign_keys="Forum.created_by"
    )
    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="author", foreign_keys="Message.author_id"
    )
