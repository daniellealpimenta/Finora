"use client";

import {
  ArrowLeft,
  ArrowRight,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FlaskConical,
  Landmark,
  Mail,
  Plug,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, type ReactNode } from "react";

import { Pila, PilaSays } from "@/components/pila";
import { Button, ErrorNote, cx, inputClass } from "@/components/ui";
import {
  api,
  ApiError,
  login,
  setToken,
  type AssistantStatus,
  type Connection,
  type SetupUser,
  type SyncStatus,
} from "@/lib/api";
import { openPluggyConnect } from "@/lib/pluggy-connect";
import { setSyncing } from "@/lib/signals";
import { Bar, BrowserSketch, FieldTag, Marker } from "./sketch";

export type StepProps = {
  n: number;
  total: number;
  next: () => void;
  back?: () => void;
};

const input = cx(inputClass, "min-h-11 w-full text-[15px]");

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Moldura de todo passo: número grande, título e texto à esquerda; desenho à direita. */
function StepLayout({
  n,
  total,
  title,
  intro,
  children,
  figure,
}: {
  n: number;
  total: number;
  title: string;
  intro: ReactNode;
  children: ReactNode;
  figure: ReactNode;
}) {
  const pad = (v: number) => String(v).padStart(2, "0");
  return (
    <div className="grid flex-1 gap-10 md:grid-cols-2 md:gap-14">
      <section data-enter className="flex flex-col gap-5">
        <div className="flex items-end gap-4">
          <span className="font-display text-[clamp(80px,9vw,120px)] leading-[0.8] font-extrabold tracking-[-0.04em] text-accent tabular">
            {pad(n)}
          </span>
          <span className="pb-1.5 text-sm text-muted">de {pad(total)}</span>
        </div>
        <h1 className="font-display text-[clamp(30px,3.4vw,40px)] leading-[1.05] font-extrabold tracking-[-0.02em]">
          {title}
        </h1>
        <div className="grid max-w-[30rem] gap-3 text-base leading-relaxed text-muted">{intro}</div>
        {children}
      </section>
      <figure data-enter className="m-0 flex flex-col justify-center gap-3">
        {figure}
      </figure>
    </div>
  );
}

function Actions({ back, children }: { back?: () => void; children: ReactNode }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-3">
      {back && (
        <Button type="button" variant="ghost" onClick={back} className="min-h-11">
          <ArrowLeft />
          Voltar
        </Button>
      )}
      {children}
    </div>
  );
}

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-2 self-start rounded-control border border-border px-4 text-sm font-semibold transition-colors duration-[var(--dur-fast)] hover:bg-surface-2"
    >
      {children}
      <ExternalLink className="size-4" aria-hidden />
    </a>
  );
}

function NumberedList({ items }: { items: ReactNode[] }) {
  return (
    <ol className="grid max-w-[30rem] gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-snug">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--pila-body)] text-xs font-extrabold text-[var(--pila-ink)]">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <figcaption className="text-[13px] text-muted">{children}</figcaption>;
}

// --- 1. Boas-vindas -----------------------------------------------------------

export function WelcomeStep(props: StepProps) {
  return (
    <StepLayout
      {...props}
      title="Oi! Eu sou o Pila."
      intro={
        <p>
          Vou te ajudar a deixar o Finora pronto. Ele junta as contas e os cartões dos seus bancos e mostra, a
          cada ciclo da fatura, quanto dá para gastar sem apertar. Tudo fica guardado só neste computador.
        </p>
      }
      figure={
        <>
          <div className="grid gap-4 rounded-card border border-border bg-surface p-6">
            <p className="font-semibold">O que você vai precisar</p>
            <ul className="grid gap-3 text-[15px] text-muted [&_li]:flex [&_li]:items-center [&_li]:gap-3 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-[var(--coin)]">
              <li>
                <Clock aria-hidden />
                Uns 15 minutos, de uma vez só
              </li>
              <li>
                <Mail aria-hidden />
                Um e-mail para criar duas contas grátis na Pluggy
              </li>
              <li>
                <Smartphone aria-hidden />
                O celular com o app do seu banco, para autorizar
              </li>
            </ul>
          </div>
          <div className="flex justify-center">
            <Pila mood="happy" size={160} alive />
          </div>
        </>
      }
    >
      <Actions>
        <Button variant="primary" onClick={props.next} className="min-h-11">
          Vamos lá
          <ArrowRight />
        </Button>
      </Actions>
    </StepLayout>
  );
}

// --- 2. Senha -----------------------------------------------------------------

export function PasswordStep(props: StepProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [typing, setTyping] = useState(false);
  const [totp, setTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Com 2FA: o QR aparece e a pessoa confirma um código antes de seguir
  const [created, setCreated] = useState<SetupUser | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (created?.totp_uri) QRCode.toString(created.totp_uri, { type: "svg", margin: 1 }).then(setQr);
  }, [created]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const confirm = String(new FormData(e.currentTarget).get("confirm"));
    if (password.length < 12) return setError("Use pelo menos 12 caracteres. Uma frase curta funciona bem.");
    if (confirm !== password) return setError("As duas senhas não estão iguais.");
    setBusy(true);
    setError(null);
    try {
      const user = await api<SetupUser>("/setup/user", {
        method: "POST",
        body: JSON.stringify({ email, password, totp }),
      });
      setToken(user.access_token);
      if (user.totp_uri) setCreated(user);
      else props.next();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const code = String(new FormData(e.currentTarget).get("code")).replace(/\D/g, "");
      await login(email, password, code);
      props.next();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Esse código não bateu. Confira o relógio do celular e tente o código novo."
          : errorText(err),
      );
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <StepLayout
        // Outra key: sem ela o React reaproveita o input do e-mail como o do código
        key="totp"
        {...props}
        title="Agora, o celular"
        intro={
          <p>
            Abra seu app autenticador (Google Authenticator, Microsoft Authenticator…) e leia o código ao lado. Depois
            digite aqui os 6 números que aparecerem.
          </p>
        }
        figure={
          <>
            <div className="grid justify-items-center gap-4 rounded-card border border-border bg-surface p-6">
              {qr && (
                <div
                  role="img"
                  aria-label="QR code do 2FA"
                  className="size-56 rounded-control bg-white p-2 [&_svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              )}
              <p className="text-center text-[13px] text-muted">
                Sem câmera? Digite este código no app:
                <br />
                <code className="text-sm font-semibold tracking-wider text-foreground">{created.totp_secret}</code>
              </p>
            </div>
          </>
        }
      >
        <form onSubmit={confirmCode} className="grid max-w-[30rem] gap-3">
          <label className="grid gap-1.5 text-sm font-semibold">
            Código de 6 dígitos
            <input
              name="code"
              inputMode="numeric"
              maxLength={7}
              autoComplete="one-time-code"
              required
              autoFocus
              className={cx(input, "tracking-[0.3em] tabular")}
            />
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Actions>
            <Button variant="primary" disabled={busy} className="min-h-11">
              {busy ? "Conferindo…" : "Confirmar"}
            </Button>
          </Actions>
        </form>
      </StepLayout>
    );
  }

  const shy = typing && !show;
  return (
    <StepLayout
      {...props}
      title="Crie sua senha"
      intro={
        <p>
          Ela protege o app se outra pessoa usar este computador. Não tem “esqueci minha senha”, então anote num lugar
          seguro.
        </p>
      }
      figure={
        <div className="flex justify-center">
          <PilaSays mood={shy ? "shy" : "happy"} size={150} alive>
            {shy ? "Pode digitar, não estou olhando." : "Uma frase que só você sabe já vale. Ex.: “meu gato dorme no sofá”."}
          </PilaSays>
        </div>
      }
    >
      <form onSubmit={create} className="grid max-w-[30rem] gap-3.5">
        <label className="grid gap-1.5 text-sm font-semibold">
          E-mail
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Senha <span className="font-normal text-muted">(pelo menos 12 caracteres)</span>
          <span className="relative">
            <input
              type={show ? "text" : "password"}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              className={cx(input, "pr-11")}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={show}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Repita a senha
          <input
            name="confirm"
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            className={input}
          />
        </label>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={totp} onChange={(e) => setTotp(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            <span className="font-semibold">Pedir também um código do celular</span> (verificação em duas etapas).
            Opcional, mais seguro.
          </span>
        </label>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Actions back={props.back}>
          <Button variant="primary" disabled={busy} className="min-h-11">
            {busy ? "Criando…" : "Criar senha"}
            <ArrowRight />
          </Button>
        </Actions>
      </form>
    </StepLayout>
  );
}

// --- 3. Meu Pluggy ------------------------------------------------------------

export function MeuPluggyStep(props: StepProps) {
  const [done, setDone] = useState(false);
  const node = "grid justify-items-center gap-2 rounded-card border border-border bg-surface px-4 py-5 text-center";
  return (
    <StepLayout
      {...props}
      title="Conecte seus bancos no Meu Pluggy"
      intro={
        <p>
          O Meu Pluggy é um app grátis da Pluggy que conversa com o seu banco pelo Open Finance, o sistema oficial do
          Banco Central. É lá que você autoriza; o Finora só lê o que você liberar.
        </p>
      }
      figure={
        <>
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2" aria-hidden>
            <div className={node}>
              <Landmark className="size-7 text-[var(--cat-home)]" />
              <span className="text-sm font-semibold">Seu banco</span>
              <span className="text-xs text-muted">você autoriza no app dele</span>
            </div>
            <ArrowRight className="size-5 text-[var(--coin)]" />
            <div className={cx(node, "border-[var(--pila-body)]")}>
              <Plug className="size-7 text-[var(--pila-body)]" />
              <span className="text-sm font-semibold">Meu Pluggy</span>
              <span className="text-xs text-muted">guarda a autorização</span>
            </div>
            <ArrowRight className="size-5 text-[var(--coin)]" />
            <div className={node}>
              <Pila mood="happy" size={40} />
              <span className="text-sm font-semibold">Este app</span>
              <span className="text-xs text-muted">guarda os dados aqui</span>
            </div>
          </div>
          <Caption>Como os dados chegam até aqui. Dá para cancelar a autorização a qualquer hora no Meu Pluggy.</Caption>
        </>
      }
    >
      <NumberedList
        items={[
          <>
            Crie sua conta em <b>meu.pluggy.ai</b>.
          </>,
          <>Conecte uma conta e escolha o seu banco.</>,
          <>O banco vai pedir confirmação no app dele. Autorize. Repita para cada banco.</>,
        ]}
      />
      <ExternalButton href="https://meu.pluggy.ai">Abrir meu.pluggy.ai</ExternalButton>
      <label className="flex items-center gap-2.5 text-sm font-semibold">
        <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        Já conectei pelo menos um banco
      </label>
      <Actions back={props.back}>
        <Button variant="primary" disabled={!done} onClick={props.next} className="min-h-11">
          Continuar
          <ArrowRight />
        </Button>
      </Actions>
    </StepLayout>
  );
}

// --- 4. Chave da Pluggy -------------------------------------------------------

export function PluggyKeysStep({ configured, ...props }: StepProps & { configured: boolean }) {
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/setup/pluggy", {
        method: "PUT",
        body: JSON.stringify({ client_id: clientId, client_secret: secret }),
      });
      props.next();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepLayout
      {...props}
      title="Pegue sua chave da Pluggy"
      intro={
        <>
          <p>
            É com ela que o app busca o que você liberou no Meu Pluggy. A conta é grátis e a chave fica guardada só
            neste computador.
          </p>
          <p style={{ color: "var(--warning)" }} className="text-sm font-semibold">
            Faça este passo e o próximo agora, de uma vez: a conta grátis da Pluggy começa com 15 dias de teste.
            Os dados continuam chegando depois, mas conecte todos os seus bancos dentro desse prazo.
          </p>
        </>
      }
      figure={
        <>
          <BrowserSketch url="dashboard.pluggy.ai">
            <div className="flex items-center gap-5 border-b border-border px-5 py-3">
              <Bar className="w-16" />
              <span className="relative rounded-chip bg-[var(--coin)] px-2.5 py-1 text-[13px] font-bold text-[#17120a]">
                Applications
                <Marker n={2} className="-top-3 -right-3.5" />
              </span>
              <Bar className="w-12" />
              <Bar className="w-14" />
            </div>
            <div className="grid gap-4 p-5">
              <div className="flex items-center justify-between">
                <Bar className="w-28" />
                <span className="relative grid size-8 place-items-center rounded-chip border-2 border-[var(--pila-body)] text-lg font-bold">
                  +
                  <Marker n={2} className="-top-3.5 -right-3.5" />
                </span>
              </div>
              <div className="grid gap-3.5 rounded-control border border-border p-4">
                <span className="text-[13px] font-bold">Finora</span>
                {[
                  ["CLIENT ID", "3c1f9a2e-xxxx-xxxx", "A"],
                  ["CLIENT SECRET", "•••••••••••••••••", "B"],
                ].map(([label, value, tag]) => (
                  <div key={tag} className="grid gap-1">
                    <span className="text-[11px] text-muted">{label}</span>
                    <span className="flex items-center justify-between rounded-chip border-2 border-[var(--coin)] bg-background px-2.5 py-2 font-mono text-xs">
                      {value}
                      <FieldTag>{tag}</FieldTag>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </BrowserSketch>
          <Caption>Desenho simplificado. O painel da Pluggy é em inglês e pode estar um pouco diferente.</Caption>
        </>
      }
    >
      <NumberedList
        items={[
          <>
            Crie uma conta em <b>dashboard.pluggy.ai</b> e, quando ele pedir, crie um time (<i>team</i>).
          </>,
          <>
            No topo, clique em <b>Applications</b> e crie uma aplicação. Pode chamar de “Finora”.
          </>,
          <>
            Copie o <b>Client ID</b> <FieldTag>A</FieldTag> e o <b>Client Secret</b> <FieldTag>B</FieldTag> para cá.
          </>,
        ]}
      />
      <ExternalButton href="https://dashboard.pluggy.ai">Abrir o painel da Pluggy</ExternalButton>
      <form onSubmit={save} className="grid max-w-[30rem] gap-3.5">
        <label className="grid gap-1.5 text-sm font-semibold">
          <span>
            <FieldTag>A</FieldTag> · Client ID
          </span>
          <input required value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="cole aqui" className={input} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          <span>
            <FieldTag>B</FieldTag> · Client Secret
          </span>
          <span className="relative">
            <input
              required
              type={show ? "text" : "password"}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="cole aqui"
              autoComplete="off"
              className={cx(input, "pr-11")}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Ocultar o segredo" : "Mostrar o segredo"}
              aria-pressed={show}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </label>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Actions back={props.back}>
          <Button variant="primary" disabled={busy} className="min-h-11">
            <ShieldCheck />
            {busy ? "Testando com a Pluggy…" : "Testar e salvar"}
          </Button>
          {configured && (
            <Button type="button" variant="ghost" onClick={props.next} className="min-h-11">
              Usar a chave já salva
            </Button>
          )}
        </Actions>
      </form>
    </StepLayout>
  );
}

// --- 5. Conectar ----------------------------------------------------------------

export function ConnectStep(props: StepProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = Boolean(sync?.running);

  useEffect(() => {
    api<Connection[]>("/connections").then(setConnections).catch(() => {});
    api<SyncStatus>("/sync/status").then(setSync).catch(() => {});
  }, []);

  // Acompanha o primeiro sync enquanto ele roda
  useEffect(() => {
    setSyncing(running);
    if (!running) return;
    const timer = setInterval(async () => {
      const s = await api<SyncStatus>("/sync/status");
      setSync(s);
      if (!s.running) setConnections(await api<Connection[]>("/connections"));
    }, 2000);
    return () => clearInterval(timer);
  }, [running]);

  async function connect(sandbox: boolean) {
    setError(null);
    setConnecting(true);
    try {
      await openPluggyConnect({
        sandbox,
        onConnected: async () => {
          setConnections(await api<Connection[]>("/connections"));
          setSync((s) => ({ ...(s as SyncStatus), running: true }));
        },
        onError: setError,
        onClose: () => setConnecting(false),
      });
    } catch (e) {
      setConnecting(false);
      setError(errorText(e));
    }
  }

  const created = sync?.last_result?.created ?? 0;
  const finished = connections.length > 0 && !running;
  const [mood, says] = running
    ? (["neutral", "Buscando suas transações… o primeiro sync traz até 12 meses e leva alguns minutos."] as const)
    : finished
      ? ([
          "celebrate",
          created ? `Chegaram ${created} transações. Pode seguir!` : "Banco conectado. Pode seguir!",
        ] as const)
      : (["happy", "Quando você conectar, eu mostro aqui o que chegou."] as const);

  return (
    <StepLayout
      {...props}
      title="Traga seus bancos para cá"
      intro={
        <p>
          Vou abrir a janelinha da Pluggy. Entre com a conta do <b>Meu Pluggy</b> que você criou e autorize. É{" "}
          <b>uma vez por banco</b>: se conectou mais de um lá, repita até todos aparecerem aqui.
        </p>
      }
      figure={
        <>
          <div className="flex justify-center">
            <PilaSays mood={mood} size={150} coin={finished}>
              {says}
            </PilaSays>
          </div>
          {connections.length > 0 && (
            <ul className="grid gap-2 rounded-card border border-border bg-surface p-4 text-sm">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{c.institution_name}</span>
                  <span className="text-muted">
                    {c.accounts.length} {c.accounts.length === 1 ? "conta" : "contas"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {sync?.last_error && !running && <ErrorNote>{sync.last_error}</ErrorNote>}
      <Actions back={props.back}>
        {finished ? (
          <>
            <Button variant="primary" onClick={props.next} className="min-h-11">
              Continuar
              <ArrowRight />
            </Button>
            <Button variant="secondary" onClick={() => connect(false)} disabled={connecting} className="min-h-11">
              <Plug />
              Conectar outro banco
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => connect(false)} disabled={connecting || running} className="min-h-11">
            <Plug />
            {running ? "Sincronizando…" : "Conectar o Meu Pluggy"}
          </Button>
        )}
      </Actions>
      {!finished && (
        <button
          type="button"
          onClick={() => connect(true)}
          disabled={connecting || running}
          className="inline-flex items-center gap-1.5 self-start text-sm text-muted underline-offset-4 hover:text-foreground hover:underline disabled:opacity-45"
        >
          <FlaskConical className="size-4" aria-hidden />
          Só quero testar com um banco de mentira (Pluggy Bank: user-ok / password-ok)
        </button>
      )}
    </StepLayout>
  );
}

// --- 6. Ciclo -------------------------------------------------------------------

export function CycleStep(props: StepProps) {
  const [mode, setMode] = useState<"card" | "day">("card");
  const [day, setDay] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const start = Number(day);
  const valid = Number.isInteger(start) && start >= 1 && start <= 28;

  async function save() {
    if (mode === "day") {
      if (!valid) return setError("Use um dia entre 1 e 28 (todo mês tem esse dia).");
      try {
        await api("/dashboard/cycle", { method: "PUT", body: JSON.stringify({ start_day: start }) });
      } catch (e) {
        return setError(errorText(e));
      }
    }
    props.next();
  }

  const shown = mode === "day" && valid ? start : 10;
  const radio = "flex items-start gap-2.5 rounded-control border border-border p-3.5 text-sm has-[:checked]:border-accent";
  return (
    <StepLayout
      {...props}
      title="Quando seu mês começa?"
      intro={
        <p>
          O app organiza tudo pelo ciclo da fatura, não pelo mês do calendário: o salário e as compras de um período
          ficam juntos. Se não souber, deixe no automático.
        </p>
      }
      figure={
        <>
          <div className="grid gap-3 rounded-card border border-border bg-surface p-5" aria-hidden>
            <div className="grid grid-cols-[repeat(31,minmax(0,1fr))] gap-[3px]">
              {Array.from({ length: 31 }, (_, i) => (
                <span
                  key={i}
                  className={cx("h-7 rounded-[3px]", i + 1 >= shown ? "bg-[var(--coin)]" : "bg-surface-2")}
                />
              ))}
            </div>
            <div className="grid grid-cols-[repeat(31,minmax(0,1fr))] gap-[3px]">
              {Array.from({ length: 31 }, (_, i) => (
                <span
                  key={i}
                  className={cx("h-7 rounded-[3px]", i + 1 < shown ? "bg-[var(--coin)]" : "bg-surface-2")}
                />
              ))}
            </div>
            <p className="text-sm">
              Um ciclo: <b>dia {shown}</b> até o <b>dia {shown === 1 ? "último" : shown - 1}</b> do mês seguinte.
            </p>
          </div>
          <Caption>Dá para mudar depois, em Contas.</Caption>
        </>
      }
    >
      <fieldset className="grid max-w-[30rem] gap-2.5">
        <legend className="sr-only">Início do ciclo</legend>
        <label className={radio}>
          <input type="radio" name="cycle" checked={mode === "card"} onChange={() => setMode("card")} className="mt-0.5 accent-[var(--accent)]" />
          <span>
            <span className="font-semibold">Seguir o fechamento do meu cartão</span> (recomendado)
            <br />
            <span className="text-muted">O app descobre sozinho pelas faturas.</span>
          </span>
        </label>
        <label className={radio}>
          <input type="radio" name="cycle" checked={mode === "day"} onChange={() => setMode("day")} className="mt-0.5 accent-[var(--accent)]" />
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Começar sempre no dia</span>
            <input
              inputMode="numeric"
              aria-label="Dia de início"
              value={day}
              onFocus={() => setMode("day")}
              onChange={(e) => setDay(e.target.value)}
              className={cx(inputClass, "min-h-9 w-16 text-right tabular")}
            />
          </span>
        </label>
      </fieldset>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Actions back={props.back}>
        <Button variant="primary" onClick={save} className="min-h-11">
          Continuar
          <ArrowRight />
        </Button>
      </Actions>
    </StepLayout>
  );
}

// --- 7. Assistente (opcional) -----------------------------------------------------

export function AssistantStep(props: StepProps) {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      setStatus(await api<AssistantStatus>("/assistant/status"));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    api<AssistantStatus>("/assistant/status").then(setStatus).catch(() => {});
  }, []);

  const found = Boolean(status?.ollama);
  return (
    <StepLayout
      {...props}
      title="Quer conversar comigo?"
      intro={
        <p>
          Eu respondo perguntas sobre os seus números. Para isso uso uma inteligência artificial que roda no seu
          computador (o Ollama), sem mandar nada para a internet. Precisa de um computador com pelo menos 8 GB de
          memória. É opcional: dá para fazer depois.
        </p>
      }
      figure={
        <div className="grid gap-4">
          <p className="ml-auto max-w-72 rounded-card rounded-br-[4px] bg-surface-2 px-3.5 py-2.5 text-sm">
            Quanto gastei com mercado neste ciclo?
          </p>
          <PilaSays mood={found ? "celebrate" : "happy"} size={130}>
            {found
              ? "Achei o Ollama! Na tela Assistente você escolhe e baixa o modelo."
              : "Eu somo tudo e te conto, comparando com o ciclo passado."}
          </PilaSays>
        </div>
      }
    >
      {!found && (
        <>
          <NumberedList
            items={[
              <>
                Baixe e instale o <b>Ollama</b>.
              </>,
              <>Abra o Ollama (ele fica perto do relógio do Windows).</>,
              <>Volte aqui e clique em “Verificar de novo”.</>,
            ]}
          />
          <ExternalButton href="https://ollama.com/download">Baixar o Ollama</ExternalButton>
        </>
      )}
      <Actions back={props.back}>
        {found ? (
          <Button variant="primary" onClick={props.next} className="min-h-11">
            Continuar
            <ArrowRight />
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={check} disabled={checking} className="min-h-11">
              {checking ? "Procurando…" : "Verificar de novo"}
            </Button>
            <Button variant="ghost" onClick={props.next} className="min-h-11">
              Pular por agora
            </Button>
          </>
        )}
      </Actions>
    </StepLayout>
  );
}

// --- Pronto -------------------------------------------------------------------------

export function DoneStep({ finish }: { finish: () => void }) {
  return (
    <div data-enter className="grid flex-1 place-items-center content-center gap-6 text-center">
      <Pila mood="celebrate" size={180} coin alive />
      <h1 className="font-display text-[clamp(34px,4vw,48px)] leading-[1.05] font-extrabold tracking-[-0.02em]">
        Tudo pronto. Cofrinho cheio!
      </h1>
      <p className="max-w-md text-base leading-relaxed text-muted">
        A cada 6 horas, enquanto o app estiver aberto, eu busco o que há de novo nos seus bancos.
      </p>
      <Button variant="primary" onClick={finish} className="min-h-12 px-6 text-base">
        Ver minhas finanças
        <ArrowRight />
      </Button>
    </div>
  );
}
