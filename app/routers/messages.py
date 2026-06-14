
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_user, get_db
from ..models.forum import Forum
from ..models.message import Message
from ..models.user import User
from ..schemas.message import MessageCreate, MessageOut, MessageUpdate
from ..services.connection_manager import manager
from ..services import minio_client

router = APIRouter(prefix="/forums/{forum_id}/messages", tags=["messages"])


@router.get("", response_model=list[MessageOut])
def get_messages(
    forum_id: int,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not db.query(Forum).filter(Forum.id == forum_id).first():
        raise HTTPException(status_code=404, detail="Fórum não encontrado")

    return (
        db.query(Message)
        .filter(
            Message.forum_id == forum_id,
            (Message.private_to_id.is_(None))
            | (Message.author_id == current_user.id)
            | (Message.private_to_id == current_user.id),
        )
        .order_by(Message.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post("", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    forum_id: int,
    data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not db.query(Forum).filter(Forum.id == forum_id).first():
        raise HTTPException(status_code=404, detail="Fórum não encontrado")

    message = Message(
        forum_id=forum_id,
        author_id=current_user.id,
        text=data.text,
        private_to_id=data.private_to_id,
        is_private=data.private_to_id is not None,
        media_url=data.media_url,
        media_type=data.media_type,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    msg_out = MessageOut.model_validate(message)
    await manager.broadcast_message(
        str(forum_id),
        msg_out.model_dump(mode="json"),
        private_to_id=data.private_to_id,
    )
    return message


@router.patch("/{message_id}", response_model=MessageOut)
def edit_message(
    forum_id: int,
    message_id: int,
    data: MessageUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    message = (
        db.query(Message)
        .filter(Message.id == message_id, Message.forum_id == forum_id)
        .first()
    )
    if not message:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    if message.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão")

    from datetime import datetime, timezone
    message.text = data.text.strip()
    message.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(message)
    return message


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(
    forum_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    message = (
        db.query(Message)
        .filter(Message.id == message_id, Message.forum_id == forum_id)
        .first()
    )
    if not message:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    if message.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão")

    if message.media_url:
        object_name = message.media_url.rsplit("/", 1)[-1]
        minio_client.delete_object(object_name)

    db.delete(message)
    db.commit()
