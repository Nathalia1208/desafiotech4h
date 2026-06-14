import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from ..core.dependencies import get_current_user, get_db
from ..models.forum import Forum
from ..models.user import User
from ..schemas.forum import ForumCreate, ForumOut, ForumUpdate
from ..models.user import User
from ..schemas.user import UserOut
from ..schemas.forum import ParticipantOut
from sqlalchemy.exc import IntegrityError as SAIntegrityError

router = APIRouter(prefix="/forums", tags=["forums"])


@router.get("", response_model=list[ForumOut])
def list_forums(search: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Forum).options(joinedload(Forum.creator))
    if search:
        query = query.filter(Forum.name.ilike(f"%{search}%"))
    forums = query.order_by(Forum.created_at.desc()).all()
    # attach participants_count from participantes_forum
    from ..models.participante import ParticipanteForum
    counts = dict(db.query(ParticipanteForum.forum_id, func.count(ParticipanteForum.usuario_id)).group_by(ParticipanteForum.forum_id).all())
    for f in forums:
        setattr(f, 'participants_count', int(counts.get(f.id, 0)))
    return forums


@router.post("", response_model=ForumOut, status_code=status.HTTP_201_CREATED)
def create_forum(
    data: ForumCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.query(Forum).filter(Forum.name == data.name).first():
        raise HTTPException(status_code=400, detail="Nome de fórum já existe")

    forum = Forum(
        name=data.name,
        description=data.description,
        created_by=int(current_user.id) if isinstance(current_user.id, str) and current_user.id.isdigit() else current_user.id,
    )
    db.add(forum)
    try:
        db.commit()
        db.refresh(forum)
        db.refresh(forum, attribute_names=["creator"])
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Erro ao criar fórum: referência inválida (verifique usuário/constraints)")

    from ..models.participante import ParticipanteForum
    creator_part = ParticipanteForum(forum_id=forum.id, usuario_id=current_user.id, is_admin=True)
    db.add(creator_part)
    db.commit()

    return forum


@router.get("/{forum_id}", response_model=ForumOut)
def get_forum(forum_id: int, db: Session = Depends(get_db)):
    forum = db.query(Forum).options(joinedload(Forum.creator)).filter(Forum.id == forum_id).first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    from ..models.participante import ParticipanteForum
    c = db.query(func.count(ParticipanteForum.usuario_id)).filter(ParticipanteForum.forum_id == forum_id).scalar() or 0
    setattr(forum, 'participants_count', int(c))
    return forum


@router.get("/{forum_id}/participants", response_model=list[ParticipantOut])
def get_forum_participants(forum_id: int, db: Session = Depends(get_db)):
    forum = db.query(Forum).filter(Forum.id == forum_id).first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    from ..models.participante import ParticipanteForum
    rows = (
        db.query(ParticipanteForum, User)
        .join(User, User.id == ParticipanteForum.usuario_id)
        .filter(ParticipanteForum.forum_id == forum_id)
        .all()
    )
    out = []
    for pf, u in rows:
        out.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "avatar_url": getattr(u, 'avatar_url', None),
            "color": u.color,
            "created_at": u.created_at,
            "online": bool(getattr(pf, 'online', False)),
            "data_entrada": getattr(pf, 'data_entrada', None),
            "is_admin": bool(getattr(pf, 'is_admin', False)),
        })
    return out


@router.post("/{forum_id}/participants", response_model=ParticipantOut, status_code=status.HTTP_201_CREATED)
async def add_forum_participant(forum_id: int, payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # payload may contain 'usuario_id' (int) or 'username'/'email' to identify the user
    forum = db.query(Forum).filter(Forum.id == forum_id).first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    from ..models.participante import ParticipanteForum
    is_creator = forum.created_by == current_user.id
    requester_row = db.query(ParticipanteForum).filter(
        ParticipanteForum.forum_id == forum_id,
        ParticipanteForum.usuario_id == current_user.id,
    ).first()
    is_admin = requester_row is not None and bool(requester_row.is_admin)

    target_id = payload.get('usuario_id')
    is_self_join = target_id is not None and int(target_id) == int(current_user.id)

    if not is_self_join and not (is_creator or is_admin):
        raise HTTPException(status_code=403, detail="Sem permissão — apenas admins podem adicionar participantes")

    usuario_id = payload.get('usuario_id')
    username = payload.get('username')
    email = payload.get('email')
    user = None
    if usuario_id:
        user = db.query(User).filter(User.id == int(usuario_id)).first()
    elif username:
        user = db.query(User).filter(User.username == username).first()
    elif email:
        user = db.query(User).filter(User.email == email).first()
    else:
        raise HTTPException(status_code=400, detail="Informe usuario_id, username ou email")

    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    from ..models.participante import ParticipanteForum
    existing = db.query(ParticipanteForum).filter(ParticipanteForum.forum_id == forum_id, ParticipanteForum.usuario_id == user.id).first()
    if existing:
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "avatar_url": getattr(user, 'avatar_url', None),
            "color": user.color,
            "created_at": user.created_at,
            "online": bool(getattr(existing, 'online', False)),
            "data_entrada": getattr(existing, 'data_entrada', None),
            "is_admin": bool(getattr(existing, 'is_admin', False)),
        }

    part = ParticipanteForum(forum_id=forum_id, usuario_id=user.id, is_admin=False)
    db.add(part)
    try:
        db.commit()
        db.refresh(part)
    except SAIntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Não foi possível adicionar participante")

    from ..models.message import Message as MessageModel
    from ..schemas.message import MessageOut
    from ..services.connection_manager import manager
    sys_text = f"{user.username} entrou no fórum" if is_self_join else f"{user.username} foi adicionado ao fórum"
    sys_msg = MessageModel(forum_id=forum_id, author_id=user.id, text=sys_text, is_system=True)
    db.add(sys_msg)
    db.commit()
    db.refresh(sys_msg)
    await manager.broadcast_message(str(forum_id), MessageOut.model_validate(sys_msg).model_dump(mode="json"))

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "avatar_url": getattr(user, 'avatar_url', None),
        "color": user.color,
        "created_at": user.created_at,
        "online": bool(getattr(part, 'online', False)),
        "data_entrada": getattr(part, 'data_entrada', None),
        "is_admin": False,
    }


@router.delete("/{forum_id}/participants/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_forum_participant(forum_id: int, usuario_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    forum = db.query(Forum).filter(Forum.id == forum_id).first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    from ..models.participante import ParticipanteForum
    requester_row = db.query(ParticipanteForum).filter(
        ParticipanteForum.forum_id == forum_id,
        ParticipanteForum.usuario_id == current_user.id,
    ).first()
    is_admin = requester_row is not None and bool(requester_row.is_admin)
    is_creator = forum.created_by == current_user.id
    is_self = usuario_id == current_user.id

    # Non-admins can only remove themselves; admins can remove others
    if not is_self and not (is_creator or is_admin):
        raise HTTPException(status_code=403, detail="Sem permissão — apenas admins podem remover participantes")

    existing = db.query(ParticipanteForum).filter(ParticipanteForum.forum_id == forum_id, ParticipanteForum.usuario_id == usuario_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Participante não encontrado")

    # If the leaving user is the only admin, promote the oldest remaining member
    if is_self and bool(existing.is_admin):
        other_admins = db.query(ParticipanteForum).filter(
            ParticipanteForum.forum_id == forum_id,
            ParticipanteForum.usuario_id != usuario_id,
            ParticipanteForum.is_admin == True,
        ).count()
        if other_admins == 0:
            next_member = (
                db.query(ParticipanteForum)
                .filter(
                    ParticipanteForum.forum_id == forum_id,
                    ParticipanteForum.usuario_id != usuario_id,
                )
                .order_by(ParticipanteForum.data_entrada.asc())
                .first()
            )
            if next_member:
                next_member.is_admin = True
                db.flush()

    leaving_user = db.query(User).filter(User.id == usuario_id).first()
    leaving_name = leaving_user.username if leaving_user else str(usuario_id)
    # Use current_user as author_id (system msg needs a valid FK)
    sys_author_id = current_user.id

    db.delete(existing)
    db.commit()

    from ..models.message import Message as MessageModel
    from ..schemas.message import MessageOut
    from ..services.connection_manager import manager
    sys_text = f"{leaving_name} saiu do fórum" if is_self else f"{leaving_name} foi removido do fórum"
    sys_msg = MessageModel(forum_id=forum_id, author_id=sys_author_id, text=sys_text, is_system=True)
    db.add(sys_msg)
    db.commit()
    db.refresh(sys_msg)
    await manager.broadcast_message(str(forum_id), MessageOut.model_validate(sys_msg).model_dump(mode="json"))


@router.patch("/{forum_id}/participants/{usuario_id}", response_model=ParticipantOut)
def set_participant_admin(forum_id: int, usuario_id: int, payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    forum = db.query(Forum).filter(Forum.id == forum_id).first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    from ..models.participante import ParticipanteForum
    requester_row = db.query(ParticipanteForum).filter(
        ParticipanteForum.forum_id == forum_id,
        ParticipanteForum.usuario_id == current_user.id,
    ).first()
    is_admin = requester_row is not None and bool(requester_row.is_admin)
    is_creator = forum.created_by == current_user.id
    if not (is_creator or is_admin):
        raise HTTPException(status_code=403, detail="Sem permissão — apenas admins podem alterar funções")

    target_row = db.query(ParticipanteForum).filter(
        ParticipanteForum.forum_id == forum_id,
        ParticipanteForum.usuario_id == usuario_id,
    ).first()
    if not target_row:
        raise HTTPException(status_code=404, detail="Participante não encontrado")

    new_is_admin = bool(payload.get("is_admin", False))
    target_row.is_admin = new_is_admin
    db.commit()
    db.refresh(target_row)

    user = db.query(User).filter(User.id == usuario_id).first()
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "avatar_url": getattr(user, 'avatar_url', None),
        "color": user.color,
        "created_at": user.created_at,
        "online": bool(getattr(target_row, 'online', False)),
        "data_entrada": getattr(target_row, 'data_entrada', None),
        "is_admin": bool(target_row.is_admin),
    }


@router.patch("/{forum_id}", response_model=ForumOut)
def update_forum(
    forum_id: int,
    data: ForumUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    forum = db.query(Forum).filter(Forum.id == forum_id).first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    from ..models.participante import ParticipanteForum
    is_creator = forum.created_by == current_user.id
    requester_row = db.query(ParticipanteForum).filter(
        ParticipanteForum.forum_id == forum_id,
        ParticipanteForum.usuario_id == current_user.id,
    ).first()
    is_admin = requester_row is not None and bool(requester_row.is_admin)
    if not (is_creator or is_admin):
        raise HTTPException(status_code=403, detail="Sem permissão")

    if data.name is not None:
        existing = db.query(Forum).filter(Forum.name == data.name, Forum.id != forum_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Nome de fórum já existe")
        forum.name = data.name
    if data.description is not None:
        forum.description = data.description
    if data.featured is not None:
        forum.featured = data.featured

    try:
        db.commit()
        db.refresh(forum)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Nome de fórum já existe")
    c = db.query(func.count(ParticipanteForum.usuario_id)).filter(ParticipanteForum.forum_id == forum_id).scalar() or 0
    setattr(forum, 'participants_count', int(c))
    return forum


@router.delete("/{forum_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_forum(
    forum_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    forum = db.query(Forum).filter(Forum.id == forum_id).first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    from ..models.participante import ParticipanteForum
    is_creator = forum.created_by == current_user.id
    requester_row = db.query(ParticipanteForum).filter(
        ParticipanteForum.forum_id == forum_id,
        ParticipanteForum.usuario_id == current_user.id,
    ).first()
    is_admin = requester_row is not None and bool(requester_row.is_admin)
    if not (is_creator or is_admin):
        raise HTTPException(status_code=403, detail="Sem permissão")

    db.query(ParticipanteForum).filter(ParticipanteForum.forum_id == forum_id).delete()
    db.delete(forum)
    db.commit()
