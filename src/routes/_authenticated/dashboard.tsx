import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import AuthModal from "@/components/auth-modal";
import { Plus, Search, Users, ArrowRight, Sparkles, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { createForum, getForums, countActive, subscribe, renameForum, deleteForum, updateForumDescription, type Forum } from "@/lib/forum-store";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Tech4UM" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const [forums, setForums] = useState<Forum[]>([]);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setForums(getForums());
    const unsub = subscribe((e) => {
      if (e.type === "forums" || e.type === "presence") {
        setForums(getForums());
        setTick((t) => t + 1);
      }
    });
    const i = setInterval(() => setTick((t) => t + 1), 5000);
    return () => { unsub(); clearInterval(i); };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return forums;
    return forums.filter(
      (f) => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
    );
  }, [forums, query]);

  // featured topics get a different card visual
  const featured = filtered.filter((f) => f.featured).slice(0, 2);
  const rest = filtered.filter((f) => !featured.includes(f));

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-extrabold text-foreground">Opa!</h1>
        <p className="mt-1 text-base font-semibold text-foreground/80">
          Sobre o que gostaria de falar hoje?
        </p>
      </div>

      <div className="mb-10 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Em busca de uma sala? Encontre-a aqui"
              className="w-full rounded-lg border border-input bg-card pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
            />
          </div>
          <button
            className="rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground px-4 transition-colors shadow-sm"
            aria-label="Buscar"
            onClick={() => {/* live-filtered */}}
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
        <button
          onClick={() => {
            if (!user) return setShowAuth(true);
            setCreating(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary-dark text-primary-foreground px-5 py-3 text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> Ou crie seu próprio 4um
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhum fórum encontrado para "{query}".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-min">
          {featured.map((f) => (
                <ForumCard key={f.id} forum={f} variant="featured" active={countActive(f.id)} _tick={tick} onRequireAuth={() => setShowAuth(true)} />
          ))}
          {rest.map((f) => (
                <ForumCard key={f.id} forum={f} variant={f.description ? "default" : "compact"} active={countActive(f.id)} _tick={tick} onRequireAuth={() => setShowAuth(true)} />
          ))}
        </div>
      )}

      {creating && (
        <CreateForumModal
          onClose={() => setCreating(false)}
          onCreate={(forum) => {
            setForums(getForums());
            setCreating(false);
            toast.success(`Fórum "${forum.name}" criado!`);
          }}
          userId={user!.id}
        />
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </main>
  );
}

function ForumCard({ forum, variant, onRequireAuth }: { forum: Forum; variant: "featured" | "default" | "compact"; active?: number; _tick?: number; onRequireAuth: () => void }) {
  const isFeatured = variant === "featured";
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwner = !!user && forum.createdBy === user.id;

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <div
        role="button"
        onClick={() => {
          if (!user) return onRequireAuth();
          navigate({ to: "/forum/$forumId", params: { forumId: forum.id } });
        }}
        className="group relative flex flex-col rounded-2xl bg-card border border-border p-5 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
      >
        {/* Admin action buttons */}
        {isOwner && (
          <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              title="Editar fórum"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDeleting(true); }}
              title="Excluir fórum"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {isFeatured && (
          <div className="mb-2 inline-flex w-fit items-center gap-1 text-xs font-bold uppercase tracking-wide text-secondary italic">Tópico em destaque!</div>
        )}

        <h3 className={`font-display font-extrabold text-primary leading-tight ${isFeatured ? "text-2xl" : "text-lg"} ${isOwner ? "pr-16" : ""}`}>{forum.name}</h3>

        <div className="mt-1 text-xs text-muted-foreground">
          {(() => {
            const creator = forum.creator?.username ?? "Desconhecido";
            const others = (forum.participants_count ?? 1) - 1;
            if (others <= 0) return creator;
            return `${creator} + ${others} ${others === 1 ? "participante" : "participantes"}`;
          })()}
        </div>
        {variant !== "compact" && forum.description && (<p className="mt-3 text-sm text-foreground/75 leading-relaxed line-clamp-3">{forum.description}</p>)}
        <div className="mt-4 flex items-end justify-between pt-3 border-t border-border/60">
          <div className="text-xs text-muted-foreground">Criado por <span className="font-semibold text-foreground">{forum.creator?.username ?? (forum.createdBy ? 'Usuário ' + forum.createdBy : 'Desconhecido')}</span></div>
          <div className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-1 text-xs font-bold shadow-sm"><Users className="h-3 w-3" />{forum.participants_count ?? 0}</div>
        </div>
      </div>

      {editing && (
        <EditForumModal
          forum={forum}
          onClose={() => setEditing(false)}
        />
      )}
      {deleting && (
        <DeleteForumModal
          forum={forum}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  );
}

function DeleteForumModal({ forum, onClose }: { forum: Forum; onClose: () => void }) {
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteForum(forum.id);
      toast.success("Fórum excluído");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-card-hover p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-extrabold text-destructive">Excluir fórum</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Tem certeza que deseja excluir o fórum{" "}
          <span className="font-semibold text-foreground">"{forum.name}"</span>?
          Esta ação não pode ser desfeita e todas as mensagens serão perdidas.
        </p>
        <div className="flex gap-2 justify-end mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-md bg-destructive hover:bg-destructive/90 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60 transition-colors"
          >
            {busy ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditForumModal({ forum, onClose }: { forum: Forum; onClose: () => void }) {
  const [name, setName] = useState(forum.name);
  const [desc, setDesc] = useState(forum.description ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const nameChanged = name.trim() !== forum.name;
      const descChanged = desc.trim() !== (forum.description ?? "");
      if (nameChanged) await renameForum(forum.id, name.trim());
      if (descChanged) await updateForumDescription(forum.id, desc.trim());
      if (nameChanged || descChanged) toast.success("Fórum atualizado");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar fórum");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-card-hover p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-extrabold text-primary">Editar fórum</h2>
        <p className="mt-1 text-sm text-muted-foreground">Altere o nome ou a descrição do fórum.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Nome do fórum</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Descrição (opcional)</div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Sobre o que vocês vão conversar?"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="rounded-md bg-primary hover:bg-primary-dark text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {busy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateForumModal({
  onClose, onCreate, userId,
}: { onClose: () => void; onCreate: (f: Forum) => void; userId: string }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = await createForum({ name, description: desc, userId });
      onCreate(f);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar fórum");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-card-hover p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-extrabold text-primary">Criar um novo 4um</h2>
        <p className="mt-1 text-sm text-muted-foreground">Dê um nome único e descreva sobre o que será.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Nome do fórum</div>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60}
              placeholder="ex: react-advanced"
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Descrição (opcional)</div>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} rows={3}
              placeholder="Sobre o que vocês vão conversar?"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={busy} className="rounded-md bg-primary hover:bg-primary-dark text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {busy ? "Criando..." : "Criar fórum"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
