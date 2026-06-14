from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .message import Message
    from .user import User


class Forum(Base):
    # Use the existing Portuguese table
    __tablename__ = "foruns"

    # table columns: id INT AUTO_INCREMENT, nome, descricao, criado_por, data_criacao
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Python attribute 'name' maps to column 'nome'
    name: Mapped[str] = mapped_column(String(100), name="nome", unique=True, nullable=False, index=True)
    # Python attribute 'description' maps to column 'descricao'
    description: Mapped[str] = mapped_column(Text, name="descricao", nullable=True, default="")
    # created_by attribute maps to 'criado_por' and references usuarios.id
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), name="criado_por", nullable=False)
    # created_at attribute maps to 'data_criacao'
    created_at: Mapped[datetime] = mapped_column(DateTime, name="data_criacao", default=lambda: datetime.now(timezone.utc))

    # keep a computed `featured` property for frontend compatibility (not persisted)
    @property
    def featured(self) -> bool:
        return False

    creator: Mapped["User"] = relationship(
        "User", back_populates="forums", foreign_keys=[created_by]
    )
    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="forum", cascade="all, delete-orphan"
    )
