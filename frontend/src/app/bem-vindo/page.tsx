"use client";

import { ArrowRight, ExternalLink, KeyRound, PartyPopper, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CoinMark, ThemeToggle } from "@/components/chrome";
import { Guilloche } from "@/components/guilloche";
import { Pila, type PilaMood } from "@/components/pila";
import { Field } from "@/components/profile/form";
import { Button, ErrorNote } from "@/components/ui";
import { api, createFirstUser, type SetupStatus } from "@/lib/api";
import { usePageEnter } from "@/lib/motion";

/**
 * Onboarding da primeira abertura (banco sem usuário): cria a conta e preenche as chaves da
 * Pluggy no .env. As chaves de sessão e de criptografia o programa já gerou sozinho.
 */
type Step = "conta" | "pluggy" | "pronto";

const MIN_PASSWORD = 12; // o mesmo da API

const SAYS: Record<Step, string> = {
  conta: "Oi! Eu sou o Pila. Vamos criar o seu acesso?",
  pluggy: "Agora a ponte com os seus bancos.",
  pronto: "Tudo pronto! Bora ver suas finanças.",
};

export default function BemVindoPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("conta");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pluggyReady, setPluggyReady] = useState(false);
  // A rota da Pluggy no Perfil pede a senha: guardada só enquanto o onboarding está aberto
  const [password, setPassword] = useState("");
  const root = useRef<HTMLElement>(null);

  usePageEnter(root, true);

  useEffect(() => {
    api<SetupStatus>("/setup")
      .then((s) => {
        // Já tem usuário: o onboarding não serve mais, vai para o login
        if (!s.needs_user) router.replace("/login");
        setPluggyReady(s.pluggy_configured);
      })
      .catch(() => setError("Não foi possível falar com o app. Feche e abra o Finora de novo."));
  }, [router]);

  async function run(action: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function onAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const username = String(form.get("username")).trim().toLowerCase();
    if (password.length < MIN_PASSWORD)
      return setError(`Use uma senha com pelo menos ${MIN_PASSWORD} caracteres.`);
    if (password !== form.get("confirm")) return setError("As senhas não conferem.");
    run(async () => {
      await createFirstUser(email, username, password);
      setStep(pluggyReady ? "pronto" : "pluggy");
    });
  }

  function onPluggy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(async () => {
      await api("/profile/pluggy", {
        method: "PUT",
        body: JSON.stringify({
          client_id: String(form.get("client_id")),
          client_secret: String(form.get("client_secret")),
          password,
        }),
      });
      setStep("pronto");
    });
  }

  const mood: PilaMood = error
    ? "worried"
    : loading
      ? "neutral"
      : step === "pronto"
        ? "celebrate"
        : "happy";
  const says = error ? "Opa, algo não deu certo." : loading ? "Só um instante…" : SAYS[step];
  const number = step === "conta" ? 1 : step === "pluggy" ? 2 : 3;

  return (
    <main ref={root} className="grid min-h-screen md:grid-cols-2">
      {/* Painel da marca: o mesmo do login, sempre grafite */}
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
              Bem-vindo ao Finora.
            </h1>
            <p className="text-base leading-relaxed text-muted">
              Dois passos e está pronto. Tudo o que você preencher fica só neste computador.
            </p>
          </div>
        </div>

        <ol className="flex flex-wrap gap-2 text-[13px] font-semibold">
          {["Seu acesso", "Pluggy", "Pronto"].map((label, i) => (
            <li
              key={label}
              aria-current={i + 1 === number ? "step" : undefined}
              className={
                i + 1 === number
                  ? "rounded-full bg-foreground px-3 py-1.5 text-background"
                  : "rounded-full bg-surface-2 px-3 py-1.5 text-muted"
              }
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </section>

      <section className="relative grid place-items-center bg-background px-4 py-12 sm:px-10">
        <div className="absolute top-3 right-3">
          <ThemeToggle />
        </div>

        {step === "conta" && (
          <form
            data-enter
            onSubmit={onAccount}
            className="grid w-full max-w-sm gap-4 rounded-card border border-card-edge bg-surface p-6 sm:p-8"
          >
            <div className="grid gap-1">
              <h2 className="font-display text-[28px] font-bold tracking-[-0.02em]">
                Crie seu acesso
              </h2>
              <p className="text-sm text-muted">É com ele que você entra no Finora.</p>
            </div>
            <Field label="E-mail" name="email" type="email" autoComplete="email" />
            <Field
              label="Nome de usuário (opcional)"
              name="username"
              required={false}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ex.: daniel"
              hint="Para entrar sem digitar o e-mail."
            />
            <Field
              label="Senha"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint={`Pelo menos ${MIN_PASSWORD} caracteres.`}
            />
            <Field label="Confirme a senha" name="confirm" type="password" autoComplete="new-password" />
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button variant="primary" disabled={loading} className="mt-1 min-h-11 w-full">
              <UserRound />
              {loading ? "Criando…" : "Criar acesso"}
            </Button>
          </form>
        )}

        {step === "pluggy" && (
          <form
            data-enter
            onSubmit={onPluggy}
            className="grid w-full max-w-md gap-4 rounded-card border border-card-edge bg-surface p-6 sm:p-8"
          >
            <div className="grid gap-1">
              <h2 className="font-display text-[28px] font-bold tracking-[-0.02em]">
                Conecte a Pluggy
              </h2>
              <p className="text-sm text-muted">
                É ela que traz as transações dos seus bancos pelo Open Finance. A conta é sua e
                gratuita para uso pessoal.
              </p>
            </div>
            <ol className="grid list-decimal gap-1.5 pl-5 text-sm leading-relaxed">
              <li>
                Entre em{" "}
                <a
                  href="https://dashboard.pluggy.ai"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-accent underline underline-offset-2"
                >
                  dashboard.pluggy.ai
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>{" "}
                e crie uma conta.
              </li>
              <li>Em Applications, crie uma aplicação.</li>
              <li>Copie o Client ID e o Client Secret e cole aqui.</li>
            </ol>
            <Field
              label="Client ID"
              name="client_id"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
            <Field
              label="Client Secret"
              name="client_secret"
              type="password"
              autoComplete="off"
              className="font-mono"
              hint="Fica guardado só no arquivo de configuração deste computador."
            />
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  setError(null);
                  setStep("pronto");
                }}
              >
                Pular por agora
              </Button>
              <Button type="submit" variant="primary" disabled={loading}>
                <KeyRound />
                {loading ? "Conferindo com a Pluggy…" : "Salvar e continuar"}
              </Button>
            </div>
          </form>
        )}

        {step === "pronto" && (
          <div
            data-enter
            className="grid w-full max-w-sm gap-4 rounded-card border border-card-edge bg-surface p-6 sm:p-8"
          >
            <div className="grid gap-1">
              <h2 className="flex items-center gap-2 font-display text-[28px] font-bold tracking-[-0.02em]">
                <PartyPopper className="size-6 text-accent" aria-hidden />
                Tudo pronto
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                Em <b className="text-foreground">Contas → Conectar banco</b> você liga os seus
                bancos. As chaves da Pluggy dá para trocar depois no Perfil.
              </p>
            </div>
            <Button
              variant="primary"
              className="min-h-11 w-full"
              onClick={() => {
                setPassword("");
                router.replace("/");
              }}
            >
              Abrir o Finora
              <ArrowRight />
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-3.5" aria-hidden />
              Nada sai da sua máquina além da conexão com a Pluggy.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
