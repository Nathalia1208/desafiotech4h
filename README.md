# Tech4UM

Plataforma de fóruns e chat em tempo real para a comunidade tech. Permite criar fóruns, trocar mensagens públicas e privadas, enviar imagens e áudios, gerenciar participantes e muito mais.

---

## Funcionalidades

- **Autenticação** — cadastro e login com JWT (7 dias de validade)
- **Fóruns** — criar, renomear, editar descrição e excluir fóruns
- **Chat em tempo real** — WebSocket com reconexão automática
- **Mensagens privadas** — visíveis apenas para remetente e destinatário
- **Mensagens de sistema** — notificações de entrada/saída estilo WhatsApp
- **Indicador de digitação** — "fulano está digitando…"
- **Presença online** — lista de quem está conectado ao fórum
- **Upload de mídia** — imagens e áudios gravados no navegador (via MinIO)
- **Gerenciamento de participantes** — adicionar, remover e promover a admin
- **Sair do fórum** — com promoção automática do membro mais antigo ao sair sendo admin
- **Notificações** — sino na navbar acumula mensagens privadas recebidas
- **Responsivo** — layout adaptado para mobile, tablet e desktop

---

## Tecnologias

<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" width="40" alt="Python" />
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/fastapi/fastapi-original.svg" width="40" alt="FastAPI" />
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/sqlalchemy/sqlalchemy-original.svg" width="40" alt="SQLAlchemy" />
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg" width="40" alt="MySQL" />
<img src="https://min.io/resources/img/logo/MINIO_Bird.png" width="40" alt="MinIO" />
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="40" alt="React" />
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="40" alt="TypeScript" />
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tailwindcss/tailwindcss-original.svg" width="40" alt="Tailwind CSS" />
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vitejs/vitejs-original.svg" width="40" alt="Vite" />
<img src="https://lucide.dev/logo.light.svg" width="40" alt="Lucide" />

### Backend
| Tecnologia | Versão |
|---|---|
| Python | 3.11+ |
| FastAPI | 0.115+ |
| SQLAlchemy | 2.0+ |
| MySQL | 8.0+ |
| MinIO | SDK 7.0+ |
| WebSockets | via Uvicorn |
| JWT | python-jose |

### Frontend
| Tecnologia | Versão |
|---|---|
| React | 19 |
| TypeScript | 5.8 |
| TanStack Router | 1.168 |
| TanStack Query | 5.83 |
| Tailwind CSS | 4.2 |
| Vite | 7.3 |
| Lucide Icons | 0.575 |
| Sonner (toasts) | 2.0 |

### Infraestrutura
- **MySQL** — banco de dados relacional
- **MinIO** — armazenamento de objetos compatível com S3 (imagens e áudios)

---

## Pré-requisitos

- **Python 3.11+**
- **Node.js 20+** e **npm 10+**
- **MySQL 8.0+** em execução
- **MinIO** em execução (local ou remoto).

---

## Estrutura do projeto

```
forumtech/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py          # Variáveis de ambiente
│   │   │   ├── dependencies.py    # Injeção de dependências
│   │   │   └── security.py        # Hash e JWT
│   │   ├── models/                # Modelos SQLAlchemy
│   │   │   ├── forum.py
│   │   │   ├── message.py
│   │   │   ├── participante.py
│   │   │   └── user.py
│   │   ├── routers/               # Endpoints FastAPI
│   │   │   ├── auth.py
│   │   │   ├── forums.py
│   │   │   ├── messages.py
│   │   │   ├── upload.py
│   │   │   ├── users.py
│   │   │   └── ws.py
│   │   ├── schemas/               # Schemas Pydantic
│   │   │   ├── forum.py
│   │   │   ├── message.py
│   │   │   └── user.py
│   │   ├── services/
│   │   │   ├── connection_manager.py  # Gerenciador de WebSockets
│   │   │   └── minio_client.py        # Cliente MinIO
│   │   ├── database.py
│   │   └── main.py
│   ├── requirements.txt
│   └── .env                       # Variáveis de ambiente (criar manualmente)
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── auth-modal.tsx
    │   │   ├── site-header.tsx
    │   │   └── ui/                # Componentes Shadcn/UI
    │   ├── lib/
    │   │   ├── auth-context.tsx
    │   │   ├── forum-store.ts
    │   │   ├── notification-store.ts
    │   │   └── use-forum-ws.ts
    │   └── routes/
    │       ├── __root.tsx
    │       ├── index.tsx
    │       └── _authenticated/
    │           ├── route.tsx
    │           ├── dashboard.tsx
    │           └── forum/$forumId.tsx
    ├── package.json
    └── vite.config.ts
```

## Configuração

### 1. Banco de dados MySQL

Crie o banco de dados e as tabelas necessárias:

```sql
CREATE DATABASE IF NOT EXISTS techdesafio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE techdesafio;

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome_usuario VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE foruns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    criado_por INT NOT NULL,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    featured TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (criado_por) REFERENCES usuarios(id)
);

CREATE TABLE mensagens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    forum_id INT NOT NULL,
    remetente_id INT NOT NULL,
    conteudo TEXT NOT NULL,
    mensagem_privada TINYINT(1) NOT NULL DEFAULT 0,
    data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
    destinatario_id INT NULL,
    editado_em DATETIME NULL,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    media_url VARCHAR(500) NULL,
    media_type VARCHAR(20) NULL,
    FOREIGN KEY (forum_id) REFERENCES foruns(id),
    FOREIGN KEY (remetente_id) REFERENCES usuarios(id),
    FOREIGN KEY (destinatario_id) REFERENCES usuarios(id)
);

CREATE TABLE participantes_forum (
    id INT AUTO_INCREMENT PRIMARY KEY,
    forum_id INT NOT NULL,
    usuario_id INT NOT NULL,
    data_entrada DATETIME DEFAULT CURRENT_TIMESTAMP,
    online TINYINT(1) NOT NULL DEFAULT 0,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_forum_usuario (forum_id, usuario_id),
    FOREIGN KEY (forum_id) REFERENCES foruns(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
```

> **Nota:** as colunas `is_system`, `media_url` e `media_type` são adicionadas automaticamente pelo backend na primeira execução caso não existam. O script acima já as inclui por completude.

---

## Instalação e execução

### Backend

```bash
cd backend

# 1. Criar e ativar ambiente virtual
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate

# 2. Instalar dependências
pip install -r requirements.txt

# 3. Criar arquivo de variáveis de ambiente
cp .env.example .env   # ou crie manualmente conforme a seção abaixo

# 4. Iniciar o servidor
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

A API estará disponível em `http://localhost:8000`.  

Documentação interativa: `http://localhost:8000/docs`

---

### Frontend

```bash
cd frontend

# 1. Instalar dependências
npm install

# 2. Iniciar em modo de desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:8080`.


## Variáveis de ambiente

Crie o arquivo `backend/.env` com o seguinte conteúdo:

```env
# Banco de dados MySQL
DATABASE_URL="mysql+pymysql: coloque a url do BD aqui"
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
MINIO_ENDPOINT=http://31.97.31.73:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=bucket
MINIO_USE_SSL=0

AS credenciais do Bucket minio eu coloquei diretamente aqui, pois posteriormente irei exckuir (então não há dados sensíveis)

---

## Regras de negócio

- Apenas **participantes** podem enviar mensagens em um fórum
- Usuários não participantes podem entrar clicando em "Entrar no fórum"
- Ao **sair de um fórum sendo o único admin**, o membro mais antigo é automaticamente promovido a admin
- **Mensagens privadas** são visíveis apenas para o remetente e o destinatário
- Ao **excluir uma mensagem** com mídia anexada, o arquivo é removido do MinIO automaticamente
- **Mensagens de sistema** (entrada/saída de membros) ficam salvas no banco e aparecem como pílulas centralizadas no chat
- Upload aceita apenas `image/*` e `audio/*`, com limite de **15 MB** por arquivo

---


## Scripts disponíveis

### Backend
```bash
uvicorn app.main:app --reload 
python -m uvicorn app.main:app --reload 
```

### Frontend
```bash
npx vite
```
