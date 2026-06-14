// In-memory-only "realtime" forum store. Nothing is persisted — all data
// lives only while the page is open. This removes localStorage and
// cross-tab syncing.

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
  createdBy: string; // user id
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

// --- In-memory state ---
const mem = {
  users: [] as User[],
  forums: [] as Forum[],
  messages: [] as Message[],
  presence: [] as Presence[],
  session: null as { userId: string; token?: string } | null,
};

// --- Realtime bus (local only) ---
type BusEvent =
  | { type: "forums" }
  | { type: "messages"; forumId: string }
  | { type: "presence"; forumId: string }
  | { type: "typing"; payload: TypingEvent };

const listeners = new Set<(e: BusEvent) => void>();
export function subscribe(fn: (e: BusEvent) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(e: BusEvent) {
  listeners.forEach((fn) => fn(e));
}

// --- Crypto ---
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + "::4um-salt");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Users / Auth ---
const PALETTE = [
  "#7c3aed", "#dc2626", "#1d4ed8", "#ea580c", "#16a34a",
  "#7e22ce", "#0f766e", "#be185d", "#65a30d", "#0891b2",
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function getUsers(): User[] { return mem.users; }
export function getUser(id: string): User | undefined { return mem.users.find((u) => u.id === id); }
export async function signUp(input: { username: string; email: string; password: string }): Promise<User> {
  // Create account via backend API. Throws on failure.
  const res = await fetch("http://127.0.0.1:8000/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: input.username, email: input.email, password: input.password }),
  });
  if (!res.ok) {
    let body = await res.text();
    try {
      const parsed = JSON.parse(body);
      body = parsed.detail ?? parsed.message ?? JSON.stringify(parsed);
    } catch (_) {}
    throw new Error(typeof body === "string" ? body : "Erro no cadastro");
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
  // store token from backend session
  setSession(user.id, data.access_token);
  return user;
}
export async function signIn(input: { email: string; password: string }): Promise<User> {
  // Authenticate via backend API. Do not accept arbitrary or empty credentials locally.
  const res = await fetch("http://127.0.0.1:8000/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  if (!res.ok) {
    let body = await res.text();
    try {
      const parsed = JSON.parse(body);
      body = parsed.detail ?? parsed.message ?? JSON.stringify(parsed);
    } catch (_) {}
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
  // store/replace user in memory
  mem.users = [...getUsers().filter((x) => x.email !== user.email), user];
  setSession(user.id, data.access_token);
  return user;
}
export function signOut() { mem.session = null; localStorage.removeItem('4um_session'); localStorage.removeItem('4um_user'); }
export function setSession(userId: string, token?: string) {
  mem.session = { userId, token };
  try {
    localStorage.setItem('4um_session', JSON.stringify(mem.session));
    const u = getUser(userId);
    if (u) localStorage.setItem('4um_user', JSON.stringify(u));
  } catch (_) {}
}
export function getSession(): { userId: string; token?: string } | null {
  const s = mem.session;
  if (!s) return null;
  return getUser(s.userId) ? s : null;
}

// Rehydrate session/user from localStorage on module load
try {
  const raw = localStorage.getItem('4um_session');
  const rawUser = localStorage.getItem('4um_user');
  if (rawUser) {
    try {
      const u = JSON.parse(rawUser);
      // ensure shape roughly matches User type
      if (u && u.id) {
        mem.users = [...mem.users.filter((x) => x.id !== String(u.id)), { ...u, id: String(u.id) }];
      }
    } catch (_) {}
  }
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (s && s.userId) mem.session = { userId: String(s.userId), token: s.token };
    } catch (_) {}
  }
} catch (_) {}

// When a user signs up/in we persist the session and the user in localStorage via setSession

// --- Forums ---
let lastSeedAt = 0;
function seed() {
  // Throttle: only hit the backend at most once every 5 seconds to prevent
  // an infinite loop (getForums → seed → emit("forums") → getForums → ...).
  const now = Date.now();
  if (now - lastSeedAt < 5000) return;
  lastSeedAt = now;
  (async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/forums");
      if (!res.ok) {
        console.error("Failed to fetch forums:", res.status, await res.text());
        return;
      }
      const data = await res.json();
      // Map backend shape to frontend Forum type
      mem.forums = (data as any[]).map((f) => ({
        id: String(f.id),
        name: f.name,
        description: f.description || "",
        createdBy: String(f.created_by),
        createdAt: Date.parse(f.created_at) || Date.now(),
        creator: f.creator ? { id: String(f.creator.id), username: f.creator.username, email: f.creator.email, color: f.creator.color, createdAt: f.creator.created_at } : null,
        featured: !!f.featured,
        participants_count: typeof f.participants_count === 'number' ? f.participants_count : 0,
      }));
      emit({ type: "forums" });
    } catch (err) {
      console.error("Error loading forums:", err);
    }
  })();
}
export function getForums(): Forum[] { seed(); return mem.forums.slice().sort((a, b) => b.createdAt - a.createdAt); }
export async function createForum(input: { name: string; description: string; userId: string }): Promise<Forum> {
  const session = getSession();
  if (!session || !session.token) throw new Error("Usuário não autenticado");

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
  const f = await res.json();
  const forum: Forum = {
    id: String(f.id),
    name: f.name,
    description: f.description || "",
    createdBy: String(f.created_by || input.userId),
    createdAt: Date.parse(f.created_at) || Date.now(),
    creator: f.creator ? { id: String(f.creator.id), username: f.creator.username, email: f.creator.email, color: f.creator.color, createdAt: f.creator.created_at } : null,
    participants_count: typeof f.participants_count === 'number' ? f.participants_count : 0,
  };
  mem.forums = [forum, ...mem.forums];
  emit({ type: "forums" });
  return forum;
}
export function getForum(id: string): Forum | undefined { return getForums().find((f) => f.id === id); }

export async function updateForumDescription(forumId: string, description: string): Promise<Forum> {
  const session = getSession();
  if (!session?.token) throw new Error('Usuário não autenticado');
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === 'string' ? body : 'Erro ao atualizar descrição');
  }
  const f = await res.json();
  const existing = mem.forums.find((x) => x.id === forumId);
  const updated: Forum = {
    id: String(f.id),
    name: f.name,
    description: f.description ?? '',
    createdBy: String(f.created_by),
    createdAt: Date.parse(f.created_at) || Date.now(),
    creator: f.creator ? { id: String(f.creator.id), username: f.creator.username, email: f.creator.email, color: f.creator.color, createdAt: f.creator.created_at } : null,
    featured: !!f.featured,
    participants_count: typeof f.participants_count === 'number' && f.participants_count > 0
      ? f.participants_count
      : (existing?.participants_count ?? 0),
  };
  mem.forums = mem.forums.map((x) => x.id === forumId ? updated : x);
  emit({ type: 'forums' });
  return updated;
}

export async function renameForum(forumId: string, name: string): Promise<Forum> {
  const session = getSession();
  if (!session?.token) throw new Error('Usuário não autenticado');
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === 'string' ? body : 'Erro ao renomear fórum');
  }
  const f = await res.json();
  const existing = mem.forums.find((x) => x.id === forumId);
  const updated: Forum = {
    id: String(f.id),
    name: f.name,
    description: f.description || '',
    createdBy: String(f.created_by),
    createdAt: Date.parse(f.created_at) || Date.now(),
    creator: f.creator ? { id: String(f.creator.id), username: f.creator.username, email: f.creator.email, color: f.creator.color, createdAt: f.creator.created_at } : null,
    featured: !!f.featured,
    participants_count: typeof f.participants_count === 'number' && f.participants_count > 0
      ? f.participants_count
      : (existing?.participants_count ?? 0),
  };
  mem.forums = mem.forums.map((x) => x.id === forumId ? updated : x);
  emit({ type: 'forums' });
  return updated;
}

export async function deleteForum(forumId: string): Promise<void> {
  const session = getSession();
  if (!session?.token) throw new Error('Usuário não autenticado');
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === 'string' ? body : 'Erro ao excluir fórum');
  }
  mem.forums = mem.forums.filter((f) => f.id !== forumId);
  emit({ type: 'forums' });
}

export async function addParticipant(forumId: string, payload: { usuario_id?: number; username?: string; email?: string }) {
  const session = getSession();
  if (!session || !session.token) throw new Error('Usuário não autenticado');
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === 'string' ? body : 'Erro ao adicionar participante');
  }
  const data = await res.json();
  // return participant-like object
  return {
    userId: String(data.id),
    forumId: String(forumId),
    username: data.username,
    color: data.color || '#888',
    lastSeen: data.online ? Date.now() : 0,
    online: !!data.online,
    dataEntrada: data.data_entrada,
    isAdmin: !!data.is_admin,
  } as Presence;
}

export async function removeParticipant(forumId: string, userId: string): Promise<void> {
  const session = getSession();
  if (!session?.token) throw new Error('Usuário não autenticado');
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/participants/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === 'string' ? body : 'Erro ao remover participante');
  }
}

export async function setParticipantAdmin(forumId: string, userId: string, isAdmin: boolean): Promise<Presence> {
  const session = getSession();
  if (!session?.token) throw new Error('Usuário não autenticado');
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/participants/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ is_admin: isAdmin }),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === 'string' ? body : 'Erro ao atualizar função');
  }
  const data = await res.json();
  return {
    userId: String(data.id),
    forumId,
    username: data.username,
    color: data.color || '#888',
    lastSeen: 0,
    online: !!data.online,
    dataEntrada: data.data_entrada,
    isAdmin: !!data.is_admin,
  };
}

// --- Messages ---
export function getMessages(forumId: string): Message[] {
  return mem.messages
    .filter((m) => m.forumId === forumId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function fetchMessages(forumId: string): Promise<Message[]> {
  const session = getSession();
  if (!session?.token) return [];
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/messages?limit=100`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const messages: Message[] = (data as any[]).map((m) => ({
    id: String(m.id),
    forumId: String(m.forum_id),
    authorId: String(m.author_id),
    authorName: m.author_name,
    text: m.text,
    createdAt: Date.parse(m.created_at) || Date.now(),
    privateToId: m.private_to_id != null ? String(m.private_to_id) : undefined,
    editedAt: m.edited_at ? Date.parse(m.edited_at) : undefined,
    isSystem: !!m.is_system,
    mediaUrl: m.media_url ?? undefined,
    mediaType: m.media_type ?? undefined,
  }));
  mem.messages = [...mem.messages.filter((m) => m.forumId !== forumId), ...messages];
  return messages;
}
export async function uploadMedia(file: Blob, filename: string): Promise<{ url: string; media_type: "image" | "audio" }> {
  const session = getSession();
  if (!session?.token) throw new Error('Usuário não autenticado');
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

export async function sendMessage(input: { forumId: string; author: User; text: string; privateToId?: string; mediaUrl?: string; mediaType?: string; }): Promise<Message> {
  const text = (input.text || '').trim();
  if (!text && !input.mediaUrl) throw new Error('Mensagem vazia');

  const session = getSession();
  // If authenticated and we have a backend session, persist via API
  if (session && session.token) {
    const payload: any = { text };
    if (input.privateToId) payload.private_to_id = Number(input.privateToId);
    if (input.mediaUrl) payload.media_url = input.mediaUrl;
    if (input.mediaType) payload.media_type = input.mediaType;
    const res = await fetch(`http://127.0.0.1:8000/forums/${input.forumId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let body = await res.text();
      try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
      throw new Error(typeof body === 'string' ? body : 'Erro ao enviar mensagem');
    }
    const data = await res.json();
    // Map backend MessageOut -> frontend Message
    const msg: Message = {
      id: String(data.id),
      forumId: String(data.forum_id),
      authorId: String(data.author_id),
      authorName: data.author_name,
      text: data.text,
      createdAt: Date.parse(data.created_at) || Date.now(),
      privateToId: data.private_to_id != null ? String(data.private_to_id) : undefined,
      editedAt: data.edited_at ? Date.parse(data.edited_at) : undefined,
      mediaUrl: data.media_url ?? undefined,
      mediaType: data.media_type ?? undefined,
    };
    mem.messages = [...mem.messages, msg];
    emit({ type: 'messages', forumId: msg.forumId });
    return msg;
  }

  // Fallback: local-only message (unauthenticated or no token)
  const msg: Message = { id: crypto.randomUUID(), forumId: input.forumId, authorId: input.author.id, authorName: input.author.username, text, createdAt: Date.now(), privateToId: input.privateToId };
  mem.messages = [...mem.messages, msg];
  emit({ type: 'messages', forumId: input.forumId });
  return msg;
}

export async function editMessage(forumId: string, messageId: string, text: string): Promise<Message> {
  const session = getSession();
  if (!session?.token) throw new Error('Usuário não autenticado');
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === 'string' ? body : 'Erro ao editar mensagem');
  }
  const data = await res.json();
  const updated: Message = {
    id: String(data.id),
    forumId: String(data.forum_id),
    authorId: String(data.author_id),
    authorName: data.author_name,
    text: data.text,
    createdAt: Date.parse(data.created_at) || Date.now(),
    privateToId: data.private_to_id != null ? String(data.private_to_id) : undefined,
    editedAt: data.edited_at ? Date.parse(data.edited_at) : undefined,
  };
  mem.messages = mem.messages.map((m) => (m.id === updated.id ? updated : m));
  return updated;
}

export async function deleteMessage(forumId: string, messageId: string): Promise<void> {
  const session = getSession();
  if (!session?.token) throw new Error('Usuário não autenticado');
  const res = await fetch(`http://127.0.0.1:8000/forums/${forumId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) {
    let body = await res.text();
    try { const p = JSON.parse(body); body = p.detail ?? p.message ?? body; } catch (_) {}
    throw new Error(typeof body === 'string' ? body : 'Erro ao excluir mensagem');
  }
  mem.messages = mem.messages.filter((m) => m.id !== messageId);
}

// --- Presence ---
export function heartbeat(user: User, forumId: string) {
  const all = mem.presence;
  const now = Date.now();
  const next = all.filter((p) => !(p.userId === user.id) || p.forumId !== forumId);
  next.push({ userId: user.id, forumId, username: user.username, color: user.color, lastSeen: now });
  mem.presence = next;
  emit({ type: "presence", forumId });
}
export function leavePresence(userId: string, forumId: string) { mem.presence = mem.presence.filter((p) => !(p.userId === userId && p.forumId === forumId)); emit({ type: "presence", forumId }); }
export function getPresence(forumId: string): Presence[] { const cutoff = Date.now() - 15000; return mem.presence.filter((p) => p.forumId === forumId && p.lastSeen > cutoff).sort((a, b) => a.username.localeCompare(b.username)); }
export function countActive(forumId: string): number { return getPresence(forumId).length; }

// --- Typing ---
export function sendTyping(ev: TypingEvent) { emit({ type: "typing", payload: ev }); }
