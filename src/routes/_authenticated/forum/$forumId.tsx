import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Send, Search, X, Lock, PanelRightClose, PanelRightOpen,
  MessageSquare, UserPlus, Wifi, WifiOff, Pencil, Trash2, Check,
  ShieldCheck, ShieldOff, UserMinus, LogOut, Image as ImageIcon, Mic, Square,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  fetchForumById, fetchForumsList, fetchMessages, sendMessage, editMessage, deleteMessage,
  fetchParticipantsList, fetchUsersList,
  addParticipant, removeParticipant, setParticipantAdmin,
  renameForum, deleteForum, updateForumDescription, uploadMedia, colorFor,
  mapMessage,
  type Forum, type Message, type Presence,
} from "@/lib/forum-store";
import { addNotification } from "@/lib/notification-store";
import { useForumWS, type WSMessagePayload, type WSPresenceUser } from "@/lib/use-forum-ws";

export const Route = createFileRoute("/_authenticated/forum/$forumId")({
  head: () => ({ meta: [{ title: "Sala — Tech4UM" }] }),
  component: ForumRoom,
});

function playPrivateMessageSound() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const freqs = [660, 880];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      const start = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch (_) {}
}

// ─── main component ─────────────────────────────────────────────────────────

function ForumRoom() {
  const { forumId } = useParams({ strict: false }) as { forumId: string };
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── server state via TanStack Query ──────────────────────────────────────

  const forumQuery = useQuery({
    queryKey: ["forum", forumId],
    queryFn: () => fetchForumById(forumId),
    placeholderData: () =>
      queryClient.getQueryData<Forum[]>(["forums"])?.find((f) => f.id === forumId),
    retry: 1,
  });
  const forum = forumQuery.data;

  const { data: forums = [] } = useQuery({
    queryKey: ["forums"],
    queryFn: fetchForumsList,
    staleTime: 5_000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", forumId],
    queryFn: () => fetchMessages(forumId),
    enabled: !!user,
  });

  const { data: dbParticipants = [] } = useQuery({
    queryKey: ["participants", forumId],
    queryFn: () => fetchParticipantsList(forumId),
  });

  // Declared here so it can be referenced by the query's `enabled` option below
  const [showUserDirectory, setShowUserDirectory] = useState(false);

  const { data: directoryUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsersList,
    enabled: showUserDirectory,
    staleTime: 30_000,
  });

  // Navigate away if forum not found
  useEffect(() => {
    if (forumQuery.isError) navigate({ to: "/dashboard", replace: true });
  }, [forumQuery.isError, navigate]);

  // ── local UI state ────────────────────────────────────────────────────────

  const [onlineMap, setOnlineMap] = useState<Map<string, { username: string; color: string }>>(
    () => new Map(),
  );
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; at: number }>>({});
  const [privateNotifs, setPrivateNotifs] = useState<Record<string, number>>({});
  const [text, setText] = useState("");
  const [privateTo, setPrivateTo] = useState<Presence | null>(null);
  const [showParticipants, setShowParticipants] = useState(true);
  const [dirSearch, setDirSearch] = useState("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [renamingForum, setRenamingForum] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [confirmDeleteForum, setConfirmDeleteForum] = useState(false);
  const [confirmLeaveForum, setConfirmLeaveForum] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionText, setDescriptionText] = useState("");
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastTyped = useRef(0);

  // Reset per-room UI state when navigating to a different forum
  useEffect(() => {
    setPrivateTo(null);
    setPrivateNotifs({});
    setOnlineMap(new Map());
  }, [forumId]);

  // ── mutations ─────────────────────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: (input: Parameters<typeof sendMessage>[0]) => sendMessage(input),
    onSuccess: (msg) => {
      queryClient.setQueryData<Message[]>(["messages", forumId], (prev = []) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ messageId, newText }: { messageId: string; newText: string }) =>
      editMessage(forumId, messageId, newText),
    onSuccess: (updated) => {
      queryClient.setQueryData<Message[]>(["messages", forumId], (prev = []) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );
    },
  });

  const deleteMsgMutation = useMutation({
    mutationFn: (messageId: string) => deleteMessage(forumId, messageId),
    onSuccess: (_, messageId) => {
      queryClient.setQueryData<Message[]>(["messages", forumId], (prev = []) =>
        prev.filter((m) => m.id !== messageId),
      );
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => renameForum(forumId, name),
    onSuccess: (updated) => {
      queryClient.setQueryData(["forum", forumId], updated);
      queryClient.invalidateQueries({ queryKey: ["forums"] });
    },
  });

  const updateDescMutation = useMutation({
    mutationFn: (desc: string) => updateForumDescription(forumId, desc),
    onSuccess: (updated) => {
      queryClient.setQueryData(["forum", forumId], updated);
      queryClient.invalidateQueries({ queryKey: ["forums"] });
    },
  });

  const deleteForumMutation = useMutation({
    mutationFn: () => deleteForum(forumId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forums"] });
      navigate({ to: "/dashboard", replace: true });
    },
  });

  const addParticipantMutation = useMutation({
    mutationFn: (payload: { usuario_id?: number; username?: string; email?: string }) =>
      addParticipant(forumId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["participants", forumId] }),
  });

  const removeParticipantMutation = useMutation({
    mutationFn: (userId: string) => removeParticipant(forumId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["participants", forumId] }),
  });

  const toggleAdminMutation = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      setParticipantAdmin(forumId, userId, isAdmin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["participants", forumId] }),
  });

  // ── WebSocket real-time ──────────────────────────────────────────────────
  const { sendTyping: wsSendTyping } = useForumWS(forumId, {
    onConnected: () => setWsConnected(true),
    onDisconnected: () => setWsConnected(false),
    onMessage: (raw: WSMessagePayload) => {
      const msg = mapMessage(raw);
      queryClient.setQueryData<Message[]>(["messages", forumId], (prev = []) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
      if (msg.isSystem) {
        queryClient.invalidateQueries({ queryKey: ["participants", forumId] });
        return;
      }
      if (msg.privateToId != null && msg.privateToId === user?.id && msg.authorId !== user?.id) {
        playPrivateMessageSound();
        addNotification({
          forumId,
          forumName: forum?.name ?? forumId,
          authorName: msg.authorName,
          text: msg.text,
          createdAt: msg.createdAt,
        });
        toast.info(`Mensagem privada de ${msg.authorName}`, {
          description: msg.text.length > 70 ? msg.text.slice(0, 70) + "…" : msg.text,
          duration: 5000,
          icon: "🔒",
        });
        setPrivateNotifs((prev) => ({
          ...prev,
          [msg.authorId]: (prev[msg.authorId] || 0) + 1,
        }));
      }
    },
    onPresence: (users: WSPresenceUser[]) => {
      const map = new Map<string, { username: string; color: string }>();
      for (const u of users) map.set(String(u.userId), { username: u.username, color: u.color });
      setOnlineMap(map);
    },
    onTyping: ({ userId, username, at }) => {
      if (String(userId) === user?.id) return;
      setTypingUsers((prev) => ({ ...prev, [String(userId)]: { name: username, at } }));
    },
  });

  // ── prune stale typing indicators ────────────────────────────────────────
  useEffect(() => {
    const i = setInterval(() => {
      const cutoff = Date.now() - 3000;
      setTypingUsers((prev) => {
        const next: typeof prev = {};
        for (const k of Object.keys(prev)) if (prev[k].at > cutoff) next[k] = prev[k];
        return next;
      });
    }, 1000);
    return () => clearInterval(i);
  }, []);

  // ── auto-scroll on new messages ───────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // ── derived state ─────────────────────────────────────────────────────────

  const participants = useMemo(
    () =>
      dbParticipants
        .map((p) => ({ ...p, online: onlineMap.has(p.userId) }))
        .sort((a, b) => {
          if (a.online !== b.online) return b.online ? 1 : -1;
          return a.username.localeCompare(b.username);
        }),
    [dbParticipants, onlineMap],
  );

  const currentUserIsParticipant = useMemo(
    () => dbParticipants.some((p) => p.userId === user?.id),
    [dbParticipants, user],
  );

  const filteredParticipants = useMemo(() => {
    const q = participantSearch.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) => p.username.toLowerCase().includes(q));
  }, [participants, participantSearch]);

  const visibleMessages = useMemo(() => {
    if (!user) return [];
    return messages.filter((m) => {
      if (!m.privateToId) return true;
      return m.authorId === user.id || m.privateToId === user.id;
    });
  }, [messages, user]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of dbParticipants) map.set(p.userId, p.username);
    if (user) map.set(user.id, user.username);
    return map;
  }, [dbParticipants, user]);

  const typingNames = Object.values(typingUsers).map((t) => t.name);
  const onlineCount = onlineMap.size;
  const totalNotifs = Object.values(privateNotifs).reduce((s, n) => s + n, 0);
  const currentUserIsAdmin = useMemo(
    () => dbParticipants.some((p) => p.userId === user?.id && p.isAdmin),
    [dbParticipants, user],
  );

  // ── actions ───────────────────────────────────────────────────────────────

  async function handleSend(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || (!text.trim() && !pendingImage)) return;

    let mediaUrl: string | undefined;
    let mediaType: string | undefined;

    if (pendingImage) {
      setUploading(true);
      try {
        const result = await uploadMedia(pendingImage.file, pendingImage.file.name);
        mediaUrl = result.url;
        mediaType = result.media_type;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao fazer upload");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const currentText = text;
    setText("");
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage.preview);
      setPendingImage(null);
    }

    try {
      await sendMutation.mutateAsync({
        forumId,
        author: user,
        text: currentText,
        privateToId: privateTo?.userId,
        mediaUrl,
        mediaType,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar");
      setText(currentText);
    }
  }

  async function handleToggleRecord() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => audioChunksRef.current.push(ev.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setUploading(true);
        try {
          const result = await uploadMedia(blob, `audio-${Date.now()}.webm`);
          await sendMutation.mutateAsync({
            forumId,
            author: user!,
            text: "",
            privateToId: privateTo?.userId,
            mediaUrl: result.url,
            mediaType: result.media_type,
          });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Erro ao enviar áudio");
        }
        setUploading(false);
        setRecording(false);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (_) {
      toast.error("Não foi possível acessar o microfone");
    }
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (pendingImage) URL.revokeObjectURL(pendingImage.preview);
    setPendingImage({ file, preview: URL.createObjectURL(file) });
    e.target.value = "";
  }

  async function handleEdit(messageId: string, newText: string) {
    try {
      await editMutation.mutateAsync({ messageId, newText });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao editar");
    }
  }

  async function handleDelete(messageId: string) {
    try {
      await deleteMsgMutation.mutateAsync(messageId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (now - lastTyped.current > 1500) {
      lastTyped.current = now;
      wsSendTyping();
    }
  }

  function handleParticipantClick(p: Presence) {
    setPrivateTo(p);
    setPrivateNotifs((prev) => {
      const next = { ...prev };
      delete next[p.userId];
      return next;
    });
    inputRef.current?.focus();
  }

  async function handleRemoveParticipant(p: Presence) {
    try {
      await removeParticipantMutation.mutateAsync(p.userId);
      if (privateTo?.userId === p.userId) setPrivateTo(null);
      toast.success(`${p.username} removido do fórum`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  function startRenameForum() {
    setRenameText(forum?.name ?? "");
    setRenamingForum(true);
    setConfirmDeleteForum(false);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

  function startEditDescription() {
    setDescriptionText(forum?.description ?? "");
    setEditingDescription(true);
    setTimeout(() => descriptionInputRef.current?.focus(), 0);
  }

  async function handleUpdateDescription() {
    const trimmed = descriptionText.trim();
    if (trimmed === (forum?.description ?? "")) { setEditingDescription(false); return; }
    try {
      await updateDescMutation.mutateAsync(trimmed);
      setEditingDescription(false);
      toast.success("Descrição atualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar descrição");
    }
  }

  async function handleRenameForum() {
    const trimmed = renameText.trim();
    if (!trimmed || trimmed === forum?.name) { setRenamingForum(false); return; }
    try {
      await renameMutation.mutateAsync(trimmed);
      setRenamingForum(false);
      toast.success("Fórum renomeado com sucesso");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao renomear fórum");
    }
  }

  async function handleJoinForum() {
    if (!user) return;
    try {
      await addParticipantMutation.mutateAsync({ usuario_id: Number(user.id) });
      toast.success("Você entrou no fórum!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar no fórum");
    }
  }

  async function handleLeaveForum() {
    if (!user) return;
    try {
      await removeParticipantMutation.mutateAsync(user.id);
      toast.success("Você saiu do fórum");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao sair do fórum");
      setConfirmLeaveForum(false);
    }
  }

  async function handleDeleteForum() {
    try {
      await deleteForumMutation.mutateAsync();
      toast.success("Fórum excluído");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir fórum");
      setConfirmDeleteForum(false);
    }
  }

  async function handleToggleAdmin(p: Presence) {
    const newValue = !p.isAdmin;
    try {
      await toggleAdminMutation.mutateAsync({ userId: p.userId, isAdmin: newValue });
      toast.success(newValue ? `${p.username} agora é admin` : `${p.username} não é mais admin`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar função");
    }
  }

  if (!forum || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-3 sm:px-6 py-3 sm:py-6">
      <div className="mb-3 sm:mb-4">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para o dashboard
        </Link>
      </div>

      <div className="flex flex-col md:flex-row gap-3 sm:gap-4 h-[calc(100dvh-9rem)] sm:h-[calc(100dvh-11rem)] min-h-0">

        {/* ── Participants panel ─────────────────────────────────────────── */}
        {showParticipants && (
          <aside className="hidden md:flex w-[240px] lg:w-[260px] flex-shrink-0 flex-col rounded-2xl bg-card border border-border shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-primary text-sm">Participantes</span>
                {totalNotifs > 0 && (
                  <span className="rounded-full bg-secondary text-secondary-foreground text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                    {totalNotifs}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {!showUserDirectory && currentUserIsAdmin && (
                  <button
                    onClick={() => setShowUserDirectory(true)}
                    title="Adicionar participante"
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </button>
                )}
                {!showUserDirectory && currentUserIsParticipant && (
                  confirmLeaveForum ? (
                    <>
                      <span className="text-[10px] text-muted-foreground font-medium">Sair?</span>
                      <button
                        onClick={handleLeaveForum}
                        title="Confirmar saída"
                        className="p-1 rounded text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmLeaveForum(false)}
                        title="Cancelar"
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmLeaveForum(true)}
                      title="Sair do fórum"
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
                <button
                  onClick={() => setShowParticipants(false)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Ocultar lista"
                >
                  <PanelRightClose className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {showUserDirectory ? (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                  <button
                    onClick={() => { setShowUserDirectory(false); setDirSearch(""); }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs font-medium text-foreground">Adicionar usuário</span>
                </div>
                <div className="px-3 py-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <input
                      value={dirSearch}
                      onChange={(e) => setDirSearch(e.target.value)}
                      placeholder="Buscar usuários…"
                      className="w-full rounded-md bg-muted pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                <ul className="flex-1 overflow-y-auto scrollbar-thin py-1">
                  {directoryUsers
                    .filter(
                      (u) =>
                        !dirSearch ||
                        u.username.toLowerCase().includes(dirSearch.toLowerCase()) ||
                        u.email.toLowerCase().includes(dirSearch.toLowerCase()),
                    )
                    .map((u) => {
                      const isMember = dbParticipants.some(
                        (p) => Number(p.userId) === Number(u.id),
                      );
                      return (
                        <li
                          key={u.id}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 transition-colors"
                        >
                          <div
                            className="flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: u.color || colorFor(String(u.id)) }}
                          >
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{u.username}</div>
                            {isMember && (
                              <div className="text-[10px] text-muted-foreground">Já é membro</div>
                            )}
                          </div>
                          {isMember ? (
                            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                              Membro
                            </span>
                          ) : (
                            <button
                              onClick={async () => {
                                try {
                                  await addParticipantMutation.mutateAsync({ usuario_id: Number(u.id) });
                                  toast.success(`${u.username} adicionado ao fórum`);
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Erro");
                                }
                              }}
                              className="text-[10px] bg-primary text-primary-foreground rounded px-2 py-0.5 hover:bg-primary-dark transition-colors"
                            >
                              Adicionar
                            </button>
                          )}
                        </li>
                      );
                    })}
                  {directoryUsers.length === 0 && (
                    <li className="px-4 py-6 text-xs text-center text-muted-foreground">
                      Nenhum usuário encontrado.
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-3 py-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <input
                      value={participantSearch}
                      onChange={(e) => setParticipantSearch(e.target.value)}
                      placeholder="Buscar…"
                      className="w-full rounded-md bg-muted pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                {onlineCount > 0 && (
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Online — {onlineCount}
                  </div>
                )}

                <ul className="flex-1 overflow-y-auto scrollbar-thin py-1">
                  {filteredParticipants.length === 0 && (
                    <li className="px-4 py-6 text-xs text-center text-muted-foreground">
                      Ninguém por aqui ainda.
                    </li>
                  )}
                  {filteredParticipants.map((p) => {
                    const isMe = p.userId === user.id;
                    const notifCount = privateNotifs[p.userId] || 0;
                    const isSelected = privateTo?.userId === p.userId;
                    return (
                      <li
                        key={p.userId}
                        className={`group flex items-center gap-1 pr-2 transition-colors ${
                          isSelected ? "bg-secondary/10 border-r-2 border-secondary" : "hover:bg-muted/60"
                        }`}
                      >
                        <button
                          disabled={isMe}
                          onClick={() => handleParticipantClick(p)}
                          className={`flex flex-1 min-w-0 items-center gap-2.5 pl-4 py-2 text-left ${isMe ? "cursor-default" : ""}`}
                          title={isMe ? "Você" : `Enviar mensagem privada para ${p.username}`}
                        >
                          <div className="relative flex-shrink-0">
                            <div
                              className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                              style={{ backgroundColor: p.color }}
                            >
                              {p.username.charAt(0).toUpperCase()}
                            </div>
                            {p.online && (
                              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-card" />
                            )}
                          </div>

                          <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">
                            {p.username}
                            {isMe && <span className="ml-1 text-muted-foreground font-normal">(você)</span>}
                          </span>

                          {p.isAdmin && !currentUserIsAdmin && (
                            <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide bg-primary/10 text-primary rounded px-1.5 py-0.5">
                              admin
                            </span>
                          )}

                          {!currentUserIsAdmin && notifCount > 0 && (
                            <span className="flex-shrink-0 rounded-full bg-secondary text-secondary-foreground text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                              {notifCount}
                            </span>
                          )}
                          {!currentUserIsAdmin && !isMe && notifCount === 0 && (
                            <MessageSquare className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          )}
                        </button>

                        {currentUserIsAdmin && !isMe && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            {notifCount > 0 && (
                              <span className="rounded-full bg-secondary text-secondary-foreground text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center leading-none mr-1">
                                {notifCount}
                              </span>
                            )}
                            {p.isAdmin && (
                              <span className="text-[9px] font-bold uppercase tracking-wide bg-primary/10 text-primary rounded px-1.5 py-0.5 mr-0.5">
                                admin
                              </span>
                            )}
                            <button
                              onClick={() => handleToggleAdmin(p)}
                              title={p.isAdmin ? "Remover admin" : "Tornar admin"}
                              className={`p-1 rounded transition-colors ${
                                p.isAdmin
                                  ? "text-primary hover:text-destructive hover:bg-destructive/10"
                                  : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                              }`}
                            >
                              {p.isAdmin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => handleRemoveParticipant(p)}
                              title={`Remover ${p.username}`}
                              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        {currentUserIsAdmin && isMe && (
                          <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide bg-primary/10 text-primary rounded px-1.5 py-0.5">
                            admin
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </aside>
        )}

        {/* ── Chat area ──────────────────────────────────────────────────── */}
        <section className="flex-1 min-w-0 flex flex-col rounded-2xl bg-card border border-border shadow-card overflow-hidden">
          <header className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              {!showParticipants && (
                <button
                  onClick={() => setShowParticipants(true)}
                  className="hidden md:block p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors relative"
                  title="Mostrar participantes"
                >
                  <PanelRightOpen className="h-4 w-4" />
                  {totalNotifs > 0 && (
                    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-secondary text-secondary-foreground text-[9px] font-bold flex items-center justify-center">
                      {totalNotifs > 9 ? "9+" : totalNotifs}
                    </span>
                  )}
                </button>
              )}
              <div className="min-w-0">
                {renamingForum ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={renameInputRef}
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleRenameForum(); }
                        if (e.key === "Escape") setRenamingForum(false);
                      }}
                      maxLength={100}
                      className="font-display text-lg font-extrabold text-primary leading-tight rounded-md border border-ring/50 bg-background px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring/50 w-48"
                    />
                    <button
                      onClick={handleRenameForum}
                      title="Salvar"
                      className="p-1 rounded text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setRenamingForum(false)}
                      title="Cancelar"
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 group/title">
                    <h2 className="font-display text-lg font-extrabold text-primary leading-tight truncate">
                      {forum.name}
                    </h2>
                    {currentUserIsAdmin && !confirmDeleteForum && (
                      <button
                        onClick={startRenameForum}
                        title="Renomear fórum"
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover/title:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
                {!renamingForum && (
                  editingDescription ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <input
                        ref={descriptionInputRef}
                        value={descriptionText}
                        onChange={(e) => setDescriptionText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleUpdateDescription(); }
                          if (e.key === "Escape") setEditingDescription(false);
                        }}
                        maxLength={300}
                        placeholder="Descrição do fórum…"
                        className="text-xs rounded border border-ring/50 bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring/50 w-56"
                      />
                      <button onClick={handleUpdateDescription} title="Salvar" className="p-0.5 rounded text-primary hover:bg-primary/10 transition-colors">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditingDescription(false)} title="Cancelar" className="p-0.5 rounded text-muted-foreground hover:bg-muted transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 group/desc mt-0.5">
                      {forum.description ? (
                        <p className="text-xs text-muted-foreground truncate">{forum.description}</p>
                      ) : currentUserIsAdmin ? (
                        <span className="text-xs text-muted-foreground/40 italic">Adicionar descrição…</span>
                      ) : null}
                      {currentUserIsAdmin && (
                        <button
                          onClick={startEditDescription}
                          title="Editar descrição"
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover/desc:opacity-100"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
              {wsConnected ? (
                <span className="hidden sm:inline-flex items-center gap-1 text-green-600">
                  <Wifi className="h-3.5 w-3.5" />
                  {onlineCount > 0 ? `${onlineCount} online` : "Conectado"}
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1 text-muted-foreground">
                  <WifiOff className="h-3.5 w-3.5" /> Conectando…
                </span>
              )}
              {currentUserIsAdmin && !renamingForum && !confirmLeaveForum && (
                confirmDeleteForum ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-destructive font-medium text-xs">Excluir fórum?</span>
                    <button
                      onClick={handleDeleteForum}
                      title="Confirmar exclusão"
                      className="p-1 rounded text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteForum(false)}
                      title="Cancelar"
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteForum(true)}
                    title="Excluir fórum"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )
              )}
            </div>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
            {visibleMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-12">
                <MessageSquare className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">Sem mensagens ainda</p>
                <p className="text-xs mt-1 opacity-70">Seja o(a) primeiro(a) a mandar um oi!</p>
              </div>
            )}

            {visibleMessages.map((m) =>
              m.isSystem ? (
                <div key={m.id} className="flex items-center justify-center py-1">
                  <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                    {m.text}
                  </span>
                </div>
              ) : (
                <MessageRow
                  key={m.id}
                  message={m}
                  myId={user.id}
                  nameById={nameById}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ),
            )}

            {typingNames.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                <span className="inline-flex gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                </span>
                {typingNames.length === 1
                  ? `${typingNames[0]} está digitando…`
                  : `${typingNames.slice(0, 2).join(", ")} estão digitando…`}
              </div>
            )}
          </div>

          {/* Composer */}
          {!currentUserIsParticipant ? (
            <div className="border-t border-border px-5 py-4 flex flex-col items-center gap-2 bg-muted/40">
              <p className="text-xs text-muted-foreground">Você não é membro deste fórum.</p>
              <button
                onClick={handleJoinForum}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-dark transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Entrar no fórum
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSend}
              className={`border-t border-border transition-all ${privateTo ? "bg-secondary/10 border-t-secondary/30" : ""}`}
            >
              {privateTo && (
                <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-secondary">
                    <Lock className="h-3 w-3" />
                    Mensagem privada para{" "}
                    <span className="underline underline-offset-2">@{privateTo.username}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPrivateTo(null)}
                    className="p-0.5 rounded text-secondary/70 hover:text-secondary hover:bg-secondary/10 transition-colors"
                    title="Cancelar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {pendingImage && (
                <div className="px-3 pt-2 flex items-start gap-2">
                  <div className="relative inline-block">
                    <img
                      src={pendingImage.preview}
                      alt="preview"
                      className="max-h-32 max-w-[200px] rounded-lg border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => { URL.revokeObjectURL(pendingImage.preview); setPendingImage(null); }}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 p-3">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImagePick}
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading || recording}
                  title="Enviar imagem"
                  className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleToggleRecord}
                  disabled={uploading}
                  title={recording ? "Parar gravação" : "Gravar áudio"}
                  className={`p-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${
                    recording
                      ? "text-destructive bg-destructive/10 hover:bg-destructive/20 animate-pulse"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => onType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={
                    recording
                      ? "Gravando áudio…"
                      : privateTo
                      ? `Mensagem privada para ${privateTo.username}…`
                      : "Escreva uma mensagem…"
                  }
                  disabled={recording}
                  className={`flex-1 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-60 ${
                    privateTo
                      ? "bg-white border border-secondary/30 text-foreground placeholder:text-muted-foreground/60"
                      : "bg-muted placeholder:text-muted-foreground/60"
                  }`}
                  maxLength={2000}
                />
                <button
                  type="submit"
                  disabled={(!text.trim() && !pendingImage) || uploading || recording}
                  className={`p-2.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${
                    privateTo
                      ? "bg-secondary text-secondary-foreground hover:bg-secondary-dark"
                      : "bg-primary text-primary-foreground hover:bg-primary-dark"
                  }`}
                >
                  {uploading
                    ? <span className="h-4 w-4 block animate-spin rounded-full border-2 border-current border-t-transparent" />
                    : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* ── Forum switcher sidebar ─────────────────────────────────────── */}
        <aside className="hidden lg:flex w-[220px] flex-shrink-0 flex-col gap-2 overflow-y-auto scrollbar-thin pr-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1">
            Outros fóruns
          </div>
          {forums.map((f) => {
            const active = f.id === forumId;
            return (
              <Link
                key={f.id}
                to="/forum/$forumId"
                params={{ forumId: f.id }}
                className={`rounded-xl p-3 border transition-all hover:-translate-y-0.5 ${
                  active
                    ? "bg-primary border-primary text-primary-foreground shadow-card-hover"
                    : "bg-card border-border hover:border-primary/40 hover:shadow-card"
                }`}
              >
                <div className={`font-display font-extrabold text-sm truncate ${active ? "text-primary-foreground" : "text-primary"}`}>
                  {f.name.length > 20 ? f.name.slice(0, 18) + "…" : f.name}
                </div>
                {f.description && (
                  <div className={`text-[10px] mt-0.5 truncate leading-snug ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {f.description.length > 40 ? f.description.slice(0, 38) + "…" : f.description}
                  </div>
                )}
              </Link>
            );
          })}
        </aside>
      </div>
    </main>
  );
}

// ─── MessageRow ──────────────────────────────────────────────────────────────

function MessageRow({
  message,
  myId,
  nameById,
  onEdit,
  onDelete,
}: {
  message: Message;
  myId: string;
  nameById: Map<string, string>;
  onEdit: (messageId: string, newText: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
}) {
  const isPrivate = !!message.privateToId;
  const isMine = message.authorId === myId;
  const recipientName = message.privateToId ? nameById.get(message.privateToId) : undefined;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setEditText(message.text);
      setTimeout(() => editRef.current?.focus(), 0);
    }
  }, [editing, message.text]);

  const time = new Date(message.createdAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  async function submitEdit() {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.text) { setEditing(false); return; }
    await onEdit(message.id, trimmed);
    setEditing(false);
  }

  return (
    <div
      className={`group flex items-start gap-3 rounded-lg transition-colors ${
        isPrivate
          ? "bg-secondary/8 border border-secondary/20 -mx-2 px-3 py-2 shadow-sm"
          : "hover:bg-muted/40 -mx-2 px-2 py-1"
      }`}
    >
      <Avatar color={colorFor(message.authorId)} name={message.authorName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground">{message.authorName}</span>

          {isPrivate && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                isMine ? "bg-secondary/15 text-secondary" : "bg-secondary/20 text-secondary"
              }`}
            >
              <Lock className="h-2.5 w-2.5" />
              {isMine
                ? recipientName ? `privado para @${recipientName}` : "privado"
                : "mensagem privada"}
            </span>
          )}

          {isMine && !editing && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
              <button
                onClick={() => setEditing(true)}
                title="Editar"
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {confirmDelete ? (
                <>
                  <span className="text-[10px] text-destructive font-medium px-1">Excluir?</span>
                  <button
                    onClick={() => { onDelete(message.id); setConfirmDelete(false); }}
                    className="p-1 rounded text-destructive hover:bg-destructive/10 transition-colors"
                    title="Confirmar"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Cancelar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  title="Excluir"
                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                if (e.key === "Escape") setEditing(false);
              }}
              rows={2}
              maxLength={2000}
              className="w-full rounded-md border border-ring/50 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={submitEdit}
                className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded px-2.5 py-1 hover:bg-primary-dark transition-colors"
              >
                <Check className="h-3 w-3" /> Salvar
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <span className="ml-auto text-[10px] text-muted-foreground">Enter para salvar · Esc para cancelar</span>
            </div>
          </div>
        ) : (
          <div className="mt-0.5 space-y-1.5">
            {message.text && (
              <p className="text-sm text-foreground/85 break-words whitespace-pre-wrap leading-relaxed">
                {message.text}
              </p>
            )}
            {message.mediaType === "image" && message.mediaUrl && (
              <img
                src={message.mediaUrl}
                alt="imagem"
                className="max-h-64 max-w-xs rounded-lg border border-border object-contain cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(message.mediaUrl, "_blank")}
              />
            )}
            {message.mediaType === "audio" && message.mediaUrl && (
              <audio controls src={message.mediaUrl} className="w-full max-w-xs h-10" />
            )}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex flex-col items-end gap-0.5 pt-0.5">
        <span className="text-[11px] text-muted-foreground tabular-nums">{time}</span>
        {message.editedAt && !editing && (
          <span className="text-[10px] text-muted-foreground/60 italic">(editado)</span>
        )}
      </div>
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ color, name }: { color: string; name: string }) {
  return (
    <div
      className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
      style={{ backgroundColor: color }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
