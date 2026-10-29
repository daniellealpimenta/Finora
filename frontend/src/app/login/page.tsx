"use client";

import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CoinMark, ThemeToggle } from "@/components/chrome";
import { Guilloche } from "@/components/guilloche";
import { Pila, type PilaMood } from "@/components/pila";
import { Button, ErrorNote, cx, inputClass, tone } from "@/components/ui";
import { ApiError, api, login, type SetupStatus } from "@/lib/api";
import { usePageEnter } from "@/lib/motion";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // O campo de 2FA só aparece se a API pedir (usuário criado com --totp)
  const [needsTotp, setNeedsTotp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Digitando a senha (oculta), o Pila fecha os olhos
  const [typingSecret, setTypingSecret] = useState(false);
  // O último e-mail ou usuário que entrou neste computador já vem no campo
  const [user, setUser] = useState("");
  const [remembered, setRemembered] = useState(false);
  const root = useRef<HTMLElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  usePageEnter(root, true);

  // Primeira abertura (nenhum usuário no banco): vai para o onboarding
  useEffect(() => {
    api<SetupStatus>("/setup")
      .then((s) => s.needs_user && router.replace("/bem-vindo"))
      .catch(() => {});
    api<{ login: string | null }>("/auth/last-login")
      .then(({ login }) => {
        if (!login) return;
        setUser((typed) => typed || login);
        setRemembered(true);
        passwordRef.current?.focus();
      })
      .catch(() => {});
  }, [router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await login(
        String(form.get("login")),
        String(form.get("password")),
        String(form.get("totp") ?? ""),
      );
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError && err.message === "TOTP_REQUIRED") {
        setNeedsTotp(true);
        setError("Digite o código de 6 dígitos do seu app autenticador.");
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível falar com o app. No modo web, confira se o backend está rodando.",
      );
    } finally {
      setLoading(false);
    }
  }

  const failed = Boolean(error) && !needsTotp;
  const shy = typingSecret && !showPassword && !failed && !loading;
  const mood: PilaMood = failed ? "worried" : loading ? "neutral" : shy ? "shy" : "happy";
  const says = failed
    ? "Hmm, não abriu. Confere a senha?"
    : loading
      ? "Abrindo o cofre…"
      : shy
        ? "Pode digitar, não estou olhando."
        : "Oi! Eu guardo tudo aqui, só no seu computador.";
  const input = cx(inputClass, "min-h-11 w-full");

  return (
    <main ref={root} className="grid min-h-screen md:grid-cols-2">
      {/* Painel da marca: sempre grafite, nos dois temas */}
      <section className="theme-dark relative isolate flex flex-col justify-between gap-8 overflow-hidden bg-background p-6 text-foreground sm:p-10 lg:p-14">
        <Guilloche className="-z-10" />
        <div className="flex items-center gap-2.5 font-display text-lg font-bold">
          <CoinMark />
          Finora
        </div>

        <div data-enter className="grid gap-6">
          <div className="flex items-end gap-4">
            <Pila mood={mood} size={168} alive className="hidden sm:block" />
            <Pila mood={mood} size={104} alive className="sm:hidden" />
            <p
              aria-live="polite"
              className="mb-14 max-w-60 rounded-card rounded-bl-[4px] bg-surface-2 px-4 py-3 text-[15px] leading-snug"
            >
              {says}
            </p>
          </div>
          <div className="grid max-w-md gap-2">
            <h1 className="font-display text-[clamp(30px,4.4vw,46px)] leading-[1.05] font-bold tracking-[-0.02em]">
              Suas finanças, guardadas no seu computador.
            </h1>
            <p className="text-base leading-relaxed text-muted">
              Os dados dos seus bancos chegam pela Pluggy e ficam só aqui.
            </p>
          </div>
        </div>

        <ul className="flex flex-wrap gap-2 text-[13px] font-semibold">
          <li style={tone("var(--positive)")} className="tint rounded-full px-3 py-1.5">
            Fica só no seu computador
          </li>
          <li style={tone("var(--cat-home)")} className="tint rounded-full px-3 py-1.5">
            Login com 2FA
          </li>
          <li style={tone("var(--accent)")} className="tint rounded-full px-3 py-1.5">
            Bancos via Open Finance
          </li>
        </ul>
      </section>

      <section className="relative grid place-items-center bg-background px-4 py-12 sm:px-10">
        <div className="absolute top-3 right-3">
          <ThemeToggle />
        </div>
        <form
          data-enter
          onSubmit={onSubmit}
          className="grid w-full max-w-sm gap-4 rounded-card border border-card-edge bg-surface p-6 sm:p-8"
        >
          <div className="grid gap-1">
            <h2 className="font-display text-[28px] font-bold tracking-[-0.02em]">Entrar</h2>
            <p className="text-sm text-muted">Bem-vindo de volta.</p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="login" className="label">
              E-mail ou usuário
            </label>
            <input
              id="login"
              name="login"
              type="text"
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={user}
              onChange={(e) => {
                setUser(e.target.value);
                setRemembered(false);
              }}
              className={input}
            />
            {remembered && (
              <button
                type="button"
                onClick={() => {
                  setUser("");
                  setRemembered(false);
                  document.getElementById("login")?.focus();
                }}
                className="justify-self-start text-xs font-semibold text-muted underline underline-offset-2 hover:text-foreground"
              >
                Entrar com outra conta
              </button>
            )}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="password" className="label">
              Senha
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                ref={passwordRef}
                onFocus={() => setTypingSecret(true)}
                onBlur={() => setTypingSecret(false)}
                className={cx(input, "pr-11")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-control text-muted transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {needsTotp && (
            <div className="grid gap-1.5">
              <label htmlFor="totp" className="label">
                Código 2FA
              </label>
              <input
                id="totp"
                name="totp"
                inputMode="numeric"
                required
                autoFocus
                autoComplete="one-time-code"
                className={cx(input, "tracking-[0.3em] tabular")}
              />
            </div>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button variant="primary" disabled={loading} className="mt-1 min-h-11 w-full">
            <LockKeyhole />
            {loading ? "Entrando…" : "Entrar"}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="size-3.5" aria-hidden />
            Nada sai da sua máquina além da conexão com a Pluggy.
          </p>
        </form>
      </section>
    </main>
  );
}
