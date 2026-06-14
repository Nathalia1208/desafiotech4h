import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (isSignUp) {
        // create account
        await signUp(name || email.split("@")[0], email, password);
        toast.success("Conta criada! Bem-vindo(a) ao 4UM");
      } else {
        // sign in
        await signIn(email, password);
        toast.success("Bem-vindo(a) de volta!");
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // reset errors
      setUsernameError(null);
      setEmailError(null);

      if (/nome de usuário|nome de usuario|username/i.test(msg)) {
        setUsernameError(msg);
        toast.error(msg);
      } else if (/e-?mail|email/i.test(msg)) {
        setEmailError(msg);
        toast.error(msg);
      } else {
        toast.error(msg || "Erro inesperado");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white border border-border/60 shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-3xl font-extrabold text-primary">Que bom ter você aqui!</h2>
        <p className="mt-2 text-sm font-medium text-muted-foreground">Para participar de um 4um é necessário fazer login.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Nome</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sara Ribikauskas" className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/70 shadow-sm" />
            {usernameError ? <div className="text-rose-600 text-sm mt-1">{usernameError}</div> : null}
          </label>

          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">E-mail</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="emaildasara@gmail.com" className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/70 shadow-sm" />
            {emailError ? <div className="text-rose-600 text-sm mt-1">{emailError}</div> : null}
          </label>

          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Senha</div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/70 shadow-sm"
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </label>

          <div className="pt-4 space-y-3">
            <button type="submit" disabled={busy} className="w-full rounded-full bg-primary hover:bg-primary-dark text-primary-foreground px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
              {busy ? "Aguarde..." : isSignUp ? "Cadastrar" : "Entrar"}
            </button>

            <div className="text-center">
              <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="text-sm font-medium text-primary underline">
                {isSignUp ? "Já tenho conta — Entrar" : "Sou novo aqui — Cadastrar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AuthModal;
