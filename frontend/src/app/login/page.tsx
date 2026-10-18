"use client";

import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ThemeToggle, VaultMark } from "@/components/chrome";
import { Pila, type PilaMood } from "@/components/pila";
import { Button, ErrorNote, cx, inputClass, tone } from "@/components/ui";
import { ApiError, login } from "@/lib/api";
import { usePageEnter } from "@/lib/motion";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // O campo de 2FA só aparece se a API pedir (usuário criado com --totp)
  const [needsTotp, setNeedsTotp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const root = useRef<HTMLElement>(null);

  usePageEnter(root, true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await login(
        String(form.get("email")),
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
          : "Não foi possível conectar à API. Confira se o backend está rodando em http://localhost:8000.",
      );
    } finally {
      setLoading(false);
    }
  }

  const failed = Boolean(error) && !needsTotp;
  const mood: PilaMood = failed ? "worried" : loading ? "neutral" : "happy";
  const says = failed
    ? "Hmm, não abriu. Confere a senha?"
    : loading
      ? "Abrindo…"
      : "Oi! Eu guardo tudo aqui, só no seu computador.";
  const input = cx(inputClass, "min-h-11 w-full");

  return (
    <main ref={root} className="grid min-h-screen md:grid-cols-2">
      {/* Painel da marca: sempre grafite, nos dois temas */}
      <section className="theme-dark flex flex-col justify-between gap-8 bg-background p-6 text-foreground sm:p-10 lg:p-14">
        <div className="flex items-center gap-2.5 font-bold">
          <VaultMark />
          ManagerFinance
        </div>

        <div data-enter className="grid gap-6">
          <div className="flex items-end gap-4">
            <Pila mood={mood} size={168} className="hidden sm:block" />
            <Pila mood={mood} size={104} className="sm:hidden" />
            <p
              aria-live="polite"
              className="mb-14 max-w-60 rounded-card rounded-bl-[4px] bg-surface-2 px-4 py-3 text-[15px] leading-snug"
            >
              {says}
            </p>
          </div>
          <div className="grid max-w-md gap-2">
            <h1 className="text-[clamp(28px,4vw,40px)] leading-[1.1] font-semibold tracking-[-0.02em]">
              Suas finanças, guardadas no seu computador.
            </h1>
            <p className="text-base leading-relaxed text-muted">
              Os dados dos seus bancos chegam pela Pluggy e ficam só aqui.
            </p>
          </div>
        </div>

        <ul className="flex flex-wrap gap-2 text-[13px] font-semibold">
          <li style={tone("var(--positive)")} className="tint rounded-full px-3 py-1.5">
            API só em 127.0.0.1
          </li>
          <li style={tone("var(--cat-home)")} className="tint rounded-full px-3 py-1.5">
            2FA opcional
          </li>
          <li style={tone("var(--accent)")} className="tint rounded-full px-3 py-1.5">
            Open Finance
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
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Entrar</h2>
            <p className="text-sm text-muted">Bem-vindo de volta.</p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="email" className="label">
              E-mail
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={input} />
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
