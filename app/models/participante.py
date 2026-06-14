from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .user import User
    from .forum import Forum


class ParticipanteForum(Base):
    __tablename__ = "participantes_forum"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    forum_id: Mapped[int] = mapped_column(Integer, ForeignKey("foruns.id"), nullable=False)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    data_entrada: Mapped[datetime] = mapped_column(DateTime, name="data_entrada")
    online: Mapped[bool] = mapped_column(Integer, name="online")
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped["User"] = relationship("User", foreign_keys=[usuario_id])
    forum: Mapped["Forum"] = relationship("Forum", foreign_keys=[forum_id])
