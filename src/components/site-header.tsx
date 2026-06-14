import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Bell, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BrandLogo } from "./brand-logo";
import { useState, useEffect, useRef } from "react";
import AuthModal from "./auth-modal";
import {
  subscribe,
  getNotifications,
  clearNotifications,
  removeNotification,
  type GlobalNotification,
} from "@/lib/notification-store";

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [showAuth, setShowAuth] = useState(false);
  const [showBell, setShowBell] = useState(false);
  const [notifications, setNotifications] = useState<GlobalNotification[]>(() => getNotifications());
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribe(() => setNotifications(getNotifications()));
    return () => { unsub(); };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showBell) return;
    function onPointerDown(e: PointerEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowBell(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showBell]);

  const unreadCount = notifications.length;

  function handleNotificationClick(n: GlobalNotification) {
    removeNotification(n.id);
    setShowBell(false);
    navigate({ to: "/forum/$forumId", params: { forumId: n.forumId } });
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-3 group">
          <BrandLogo />
          <span className="hidden sm:inline text-sm text-muted-foreground font-medium">
            Seu fórum sobre tecnologia!
          </span>
        </Link>

        {user ? (
          <div className="flex items-center gap-4">
            {/* Bell */}
            <div ref={bellRef} className="relative">
              <button
                onClick={() => setShowBell((v) => !v)}
                title="Notificações"
                className="relative p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {showBell && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-card border border-border shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="text-sm font-semibold text-foreground">Notificações</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => { clearNotifications(); setShowBell(false); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Limpar tudo
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Nenhuma notificação
                    </div>
                  ) : (
                    <ul className="max-h-80 overflow-y-auto divide-y divide-border">
                      {notifications.map((n) => (
                        <li key={n.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/60 transition-colors cursor-pointer">
                          <button
                            className="flex-1 min-w-0 text-left"
                            onClick={() => handleNotificationClick(n)}
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-xs font-semibold text-primary truncate">{n.forumName}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">{formatTime(n.createdAt)}</span>
                            </div>
                            <p className="text-xs text-foreground font-medium">{n.authorName}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {n.text.length > 60 ? n.text.slice(0, 60) + "…" : n.text}
                            </p>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                            className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                            title="Dispensar"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-foreground">{user.username}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
            </div>
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full text-white font-semibold text-base shadow-sm"
              style={{ backgroundColor: user.color }}
              title={user.username}
            >
              {user.username.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={() => { signOut(); navigate({ to: "/" }); }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => setShowAuth(true)} className="text-sm font-semibold text-foreground hover:text-primary transition-colors">Fazer Login</button>
            <div className="h-10 w-10 rounded-full bg-secondary" />
          </div>
        )}
      </div>
    </header>
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
