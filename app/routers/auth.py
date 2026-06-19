import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_user, get_db
from ..core.security import create_access_token, hash_password, verify_password
from ..models.user import User, compute_color
from ..schemas.user import TokenResponse, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail={"message": "E-mail já cadastrado", "error_code": "EMAIL_ALREADY_EXISTS"})

    if not data.password or not data.password.strip():
        raise HTTPException(status_code=400, detail="Senha é obrigatória")

    # check username uniqueness (legacy table enforces unique nome_usuario)
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail={"message": "Nome de usuário já existe", "error_code": "USERNAME_ALREADY_EXISTS"})

    # deixar que a tabela legada atribua automaticamente um ID inteiro (autoincremento)
    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        # Unique constraint  em nome_usuario ou e-mail violada
        raise HTTPException(status_code=400, detail={"message": "Nome de usuário ou e-mail já existe", "error_code": "USERNAME_OR_EMAIL_ALREADY_EXISTS"})
    # color uma propriedade calculada do modelo (baseada no id), portanto nenhuma atualização no banco de dados é necessária

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/signin", response_model=TokenResponse)
def signin(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    #  impedir tentativas com senha vazia
    if not data.password or not data.password.strip():
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    # First try bcrypt verification
    if verify_password(data.password, user.password_hash):
        pass
    else:
        # fallback: senha legada armazenada em texto puro no campo senha_hash
        # aceitar login só se  a senha informada for igual ao valor armazenado

        if user.password_hash == data.password:
            # upgrade to bcrypt hash
            user.password_hash = hash_password(data.password)
            db.commit()
            db.refresh(user)
        else:
            # rejeição para senha errada 
            raise HTTPException(status_code=401, detail="Credenciais inválidas")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user