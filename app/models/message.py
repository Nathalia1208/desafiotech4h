from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .forum import Forum
    from .user import User


class Message(Base):
    # map to existing legacy table `mensagens`
    __tablename__ = "mensagens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # forum_id references foruns.id (int primary key)
    forum_id: Mapped[int] = mapped_column(Integer, ForeignKey("foruns.id"), nullable=False, index=True)
    # author_id maps to remetente_id column (usuarios.id)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False, name="remetente_id")
    # store text in 'conteudo' column
    text: Mapped[str] = mapped_column(Text, nullable=False, name="conteudo")
    # whether this is a private message (mensagem_privada)
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, name="mensagem_privada")
    # timestamp stored in data_envio
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True, name="data_envio"
    )
    # destinatario_id column (nullable)
    private_to_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True, name="destinatario_id")
    edited_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, name="editado_em")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    media_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    media_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    forum: Mapped["Forum"] = relationship("Forum", back_populates="messages")
    author: Mapped["User"] = relationship(
        "User", back_populates="messages", foreign_keys=[author_id]
    )
    private_to: Mapped[Optional["User"]] = relationship("User", foreign_keys=[private_to_id])

    @property
    def author_name(self) -> str:
        # provide the author's username for APIs without storing it on the mensagens table
        return self.author.username if self.author is not None else ""
