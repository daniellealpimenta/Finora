"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // O campo de 2FA só aparece se a API pedir (usuário criado com --totp)
  const [needsTotp, setNeedsTotp] = useState(false);

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
        setError("Digite o código do seu app autenticador.");
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível conectar à API. O backend está rodando em http://localhost:8000?",
      );
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-accent";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">ManagerFinance</h1>
        <input name="email" type="email" placeholder="E-mail" required className={input} />
        <input
          name="password"
          type="password"
          placeholder="Senha"
          required
          className={input}
          autoComplete="current-password"
        />
        {needsTotp && (
          <input
            name="totp"
            inputMode="numeric"
            placeholder="Código 2FA"
            required
            autoFocus
            className={input}
            autoComplete="one-time-code"
          />
        )}
        {error && <p className="text-sm text-negative">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-lg bg-accent py-2 font-medium text-accent-fg disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
