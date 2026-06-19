// API layer + local state for auth and presence.
// Server data (forums, messages, participants) is managed by TanStack Query —
// no in-memory cache for those here.

export type User = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  color: string;
  createdAt: number;
};

export type Forum = {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: number;
  featured?: boolean;
  creator?: { id: string; username: string; email?: string; color?: string; createdAt?: number } | null;
  participants_count?: number;
};

export type Message = {
  id: string;
  forumId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
  privateToId?: string;
  editedAt?: number;
  isSystem?: boolean;
  mediaUrl?: string;
  mediaType?: "image" | "audio";
};

export type Presence = {
  userId: string;
  forumId: string;
  username: string;
  color: string;
  lastSeen: number;
  online?: boolean;
  dataEntrada?: string | null;
  isAdmin?: boolean;
};

export type TypingEvent = {
  userId: string;
  forumId: string;
  username: string;
  at: number;
};

// --- Local state (auth + presence only) ---
const mem = {
  users: [] as User[],
  presence: [] as Presence[],
  session: null as { userId: string; token?: string } | null,
};

// --- Color palette ---
const PALETTE = [
  "#7c3aed", "#dc2626", "#1d4ed8", "#ea580c", "#16a34a",
  "#7e22ce", "#0f766e", "#be185d", "#65a30d", "#0891b2",
];
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// --- Shape mappers ---
function mapForum(f: any): Forum {
  return {
    id: String(f.id),
    name: f.name,
    description: f.description || "",
    createdBy: String(f.created_by),
    createdAt: Date.parse(f.created_at) || Date.now(),
    creator: f.creator
      ? {
          id: String(f.creator.id),
          username: f.creator.username,
          email: f.creator.email,
          color: f.creator.color,
          createdAt: f.creator.created_at,
        }
      : null,
    featured: !!f.featured,
    participants_count: typeof f.participants_count === "number" ? f.participants_count : 0,
  };
}

export function mapMessage(m: any): Message {
  return {
    id: String(m.id),
    forumId: String(m.forum_id),
    authorId: String(m.author_id),
    authorName: m.author_name,
    text: m.text,
    createdAt:
      typeof m.created_at === "number"
        ? m.created_at
        : Date.parse(m.created_at) || Date.now(),
    privateToId: m.private_to_id != null ? String(m.private_to_id) : undefined,
    editedAt: m.edited_at ? Date.parse(m.edited_at) : undefined,
    isSystem: !!m.is_system,
    mediaUrl: m.media_url ?? undefined,
    mediaType: m.media_type ?? undefined,
  };
}

export function mapParticipant(u: any, forumId: string): Presence {
  return {
    userId: String(u.id),
    forumId,
    username: u.username || u.email,
    color: u.color || colorFor(String(u.id)),
    lastSeen: 0,
    online: !!u.online,
    dataEntrada: u.data_entrada ?? null,
    isAdmin: !!u.is_admin,
  };
}

// --- Crypto ---
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + "::4um-salt");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Auth ---
export function getUsers(): User[] { return mem.users; }
export function getUser(id: string): User | undefined { return mem.users.find((u) => u.id === id); }

export async function signUp(input: { username: string; email: string; password: string }): Promise<User> {
  const res = await fetch("http://127.0.0.1:8000/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: input.username, email: input.email, password: input.password }),
  });
  if (!res.ok) {
    const raw = await res.text();
    try {
      const p = JSON.parse(raw);
      const detail = p.detail;
      if (detail && typeof detail === "object" && detail.error_code) {
        const err = new Error(detail.message ?? "Erro no cadastro");
        (err as any).error_code = detail.error_code;
        throw err;
      }
      const msg = typeof detail === "string" ? detail : p.message ?? JSON.stringify(p);
      throw new Error(typeof msg === "string" ? msg : "Erro no cadastro");
    } catch (e) { if (e instanceof Error) throw e; }
    throw new Error("Erro no cadastro");
  }
  const data = await res.json();
  const u = data.user;
  const user: User = {
    id: String(u.id),
    username: u.username,
    email: u.email,
    passwordHash: "",
    color: u.color || colorFor(String(u.id)),
    createdAt: Date.parse(u.created_at) || Date.now(),
  };
  mem.users = [...getUsers(), user];
  setSession(user.id, data.access_token);
  return user;
}

export async function signIn(input: { email: string; password: string }): Promise<User> {
  const res = await fetch("http://127.0.0.1:8000/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? JSON.stringify(p); } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Credenciais inválidas");
  }
  const data = await res.json();
  const u = data.user;
  const user: User = {
    id: String(u.id),
    username: u.username,
    email: u.email,
    passwordHash: "",
    color: u.color || colorFor(String(u.id)),
    createdAt: Date.parse(u.created_at) || Date.now(),
  };
  mem.users = [...getUsers().filter((x) => x.email !== user.email), user];
  setSession(user.id, data.access_token);
  return user;
}

export function signOut() {
  mem.session = null;
  localStorage.removeItem("4um_session");
  localStorage.removeItem("4um_user");
}

export function setSession(userId: string, token?: string) {
  mem.session = { userId, token };
  try {
    localStorage.setItem("4um_session", JSON.stringify(mem.session));
    const u = getUser(userId);
    if (u) localStorage.setItem("4um_user", JSON.stringify(u));
  } catch (_) {}
}

export function getSession(): { userId: string; token?: string } | null {
  const s = mem.session;
  if (!s) return null;
  return getUser(s.userId) ? s : null;
}

// Rehydrate session/user from localStorage on module load
try {
  const rawUser = localStorage.getItem("4um_user");
  if (rawUser) {
    try {
      const u = JSON.parse(rawUser);
      if (u && u.id) {
        mem.users = [...mem.users.filter((x) => x.id !== String(u.id)), { ...u, id: String(u.id) }];
      }
    } catch (_) {}
  }
  const raw = localStorage.getItem("4um_session");
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (s && s.userId) mem.session = { userId: String(s.userId), token: s.token };
    } catch (_) {}
  }
} catch (_) {}

// --- Forums (queryFns) ---
export async function fetchForumsList(): Promise<Forum[]> {
  const res = await fetch("http://127.0.0.1:8000/forums");
  if (!res.ok) throw new Error("Erro ao carregar fóruns");
  return (await res.json() as any[]).map(mapForum);
}

export async function fetchForumById(id: string): Promise<Forum> {
  const res = await fetch(`http://127.0.0.1:8000/forums/${id}`);
  if (!res.ok) throw new Error("Fórum não encontrado");
  return mapForum(await res.json());
}

export async function createForum(input: { name: string; description: string; userId: string }): Promise<Forum> {
  const session = getSession();
  if (!session?.token) throw new Error("Usuário não autenticado");
  const res = await fetch("http://127.0.0.1:8000/forums", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ name: input.name, description: input.description }),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro ao criar fórum");
  }
  return mapForum(await res.json());
}

export async function updateForumDescription(forumId: string, description: string): Promise<Forum> {
  const session = getSession();
  if (!session?.token) throw new Error("Usuário não autenticado");
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro ao atualizar descrição");
  }
  return mapForum(await res.json());
}

export async function renameForum(forumId: string, name: string): Promise<Forum> {
  const session = getSession();
  if (!session?.token) throw new Error("Usuário não autenticado");
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro ao renomear fórum");
  }
  return mapForum(await res.json());
}

export async function deleteForum(forumId: string): Promise<void> {
  const session = getSession();
  if (!session?.token) throw new Error("Usuário não autenticado");
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro ao excluir fórum");
  }
}

// --- Participants (queryFns + mutationFns) ---
export async function fetchParticipantsList(forumId: string): Promise<Presence[]> {
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/participants`);
  if (!res.ok) return [];
  return (await res.json() as any[]).map((u) => mapParticipant(u, forumId));
}

export async function addParticipant(
  forumId: string,
  payload: { usuario_id?: number; username?: string; email?: string },
): Promise<Presence> {
  const session = getSession();
  if (!session?.token) throw new Error("Usuário não autenticado");
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/participants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro ao adicionar participante");
  }
  return mapParticipant(await res.json(), forumId);
}

export async function removeParticipant(forumId: string, userId: string): Promise<void> {
  const session = getSession();
  if (!session?.token) throw new Error("Usuário não autenticado");
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/participants/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro ao remover participante");
  }
}

export async function setParticipantAdmin(
  forumId: string,
  userId: string,
  isAdmin: boolean,
): Promise<Presence> {
  const session = getSession();
  if (!session?.token) throw new Error("Usuário não autenticado");
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/participants/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ is_admin: isAdmin }),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro ao atualizar função");
  }
  return mapParticipant(await res.json(), forumId);
}

// --- Users directory ---
export async function fetchUsersList(): Promise<{ id: number; username: string; email: string; color?: string }[]> {
  const session = getSession();
  const headers: Record<string, string> = {};
  if (session?.token) headers["Authorization"] = `Bearer ${session.token}`;
  const res = await fetch("http://127.0.0.1:8000/users", { headers });
  if (!res.ok) return [];
  return (await res.json() as any[]).map((u) => ({
    id: u.id,
    username: u.username || u.email,
    email: u.email,
    color: u.color,
  }));
}

// --- Messages ---
export async function fetchMessages(forumId: string): Promise<Message[]> {
  const session = getSession();
  if (!session?.token) return [];
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/messages?limit=100`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) return [];
  return (await res.json() as any[]).map(mapMessage);
}

export async function uploadMedia(
  file: Blob,
  filename: string,
): Promise<{ url: string; media_type: "image" | "audio" }> {
  const session = getSession();
  if (!session?.token) throw new Error("Usuário não autenticado");
  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetch("http://127.0.0.1:8000/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: form,
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro ao fazer upload");
  }
  return res.json();
}

export async function sendMessage(input: {
  forumId: string;
  author: User;
  text: string;
  privateToId?: string;
  mediaUrl?: string;
  mediaType?: string;
}): Promise<Message> {
  const text = (input.text || "").trim();
  if (!text && !input.mediaUrl) throw new Error("Mensagem vazia");

  const session = getSession();
  if (session?.token) {
    const payload: any = { text };
    if (input.privateToId) payload.private_to_id = Number(input.privateToId);
    if (input.mediaUrl) payload.media_url = input.mediaUrl;
    if (input.mediaType) payload.media_type = input.mediaType;
    const res = await fetch(`http://127.0.0.1:8000/forums/${input.forumId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let body = await res.text();
      try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
      throw new Error(typeof body === "string" ? body : "Erro ao enviar mensagem");
    }
    return mapMessage(await res.json());
  }

  // Fallback: local-only (unauthenticated)
  return {
    id: crypto.randomUUID(),
    forumId: input.forumId,
    authorId: input.author.id,
    authorName: input.author.username,
    text,
    createdAt: Date.now(),
    privateToId: input.privateToId,
  };
}

export async function editMessage(forumId: string, messageId: string, text: string): Promise<Message> {
  const session = getSession();
  if (!session?.token) throw new Error("Usuário não autenticado");
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro ao editar mensagem");
  }
  return mapMessage(await res.json());
}

export async function deleteMessage(forumId: string, messageId: string): Promise<void> {
  const session = getSession();
  if (!session?.token) throw new Error("Usuário não autenticado");
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/messages/${messageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro ao excluir mensagem");
  }
}

// --- Presence (local only, populated by WS heartbeat in forum rooms) ---
export function heartbeat(user: User, forumId: string) {
  const now = Date.now();
  const next = mem.presence.filter((p) => !(p.userId === user.id && p.forumId === forumId));
  next.push({ userId: user.id, forumId, username: user.username, color: user.color, lastSeen: now });
  mem.presence = next;
}

export function leavePresence(userId: string, forumId: string) {
  mem.presence = mem.presence.filter((p) => !(p.userId === userId && p.forumId === forumId));
}

export function getPresence(forumId: string): Presence[] {
  const cutoff = Date.now() - 15000;
  return mem.presence
    .filter((p) => p.forumId === forumId && p.lastSeen > cutoff)
    .sort((a, b) => a.username.localeCompare(b.username));
}

export function countActive(forumId: string): number {
  return getPresence(forumId).length;
}