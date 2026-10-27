"use client";

import { Copy, HardDrive, KeyRound, LogOut, ShieldCheck, Smile } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { NotificationsCard } from "@/components/profile/notifications";
import { Field, FormDialog } from "@/components/profile/form";
import { MASCOTS, Pila, useMascot, type MascotId } from "@/components/pila";
import {
  Button,
  Card,
  CardTitle,
  ErrorNote,
  PageHeader,
  Pill,
  StatusShape,
  STATUS_COLOR,
  cx,
} from "@/components/ui";
import { api, setToken, type Profile, type TotpSetup } from "@/lib/api";
import { usePageEnter } from "@/lib/motion";
import { notify } from "@/lib/signals";

const COLOR = "var(--accent)";

const bytes = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
    : `${Math.ceil(n / 1e3).toLocaleString("pt-BR")} KB`;

type Open = "email" | "username" | "password" | "totp-on" | "totp-off" | null;

export default function PerfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();

  usePageEnter(root, profile !== null);

  const load = useCallback(
    () =>
      api<Profile>("/profile")
        .then(setProfile)
        .catch((e) => setError(e instanceof Error ? e.message : String(e))),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  function saved(message: string) {
    notify(message);
    load();
  }

  return (
    <div ref={root}>
      <PageHeader
        title="Perfil"
        description="Seu acesso e as chaves que o app usa. Tudo fica neste computador; as chaves aparecem só pelo final."
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              setToken(null);
              router.replace("/login");
            }}
          >
            <LogOut />
            Sair
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {profile && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card data-enter>
            <CardTitle icon={ShieldCheck} color={COLOR}>
              Acesso
            </CardTitle>
            <dl className="grid divide-y divide-border">
              <Row
                term="E-mail"
                action={
                  <Button className="min-h-9" onClick={() => setOpen("email")}>
                    Trocar
                  </Button>
                }
              >
                <span className="font-medium break-all">{profile.email}</span>
                <span className="text-xs text-muted">
                  Conta criada em {new Date(profile.created_at).toLocaleDateString("pt-BR")}
                </span>
              </Row>
              <Row
                term="Nome de usuário"
                action={
                  <Button className="min-h-9" onClick={() => setOpen("username")}>
                    {profile.username ? "Trocar" : "Criar"}
                  </Button>
                }
              >
                {profile.username ? (
                  <span className="font-medium">{profile.username}</span>
                ) : (
                  <span className="font-medium text-muted">Nenhum</span>
                )}
                <span className="text-xs text-muted">
                  Entra no login no lugar do e-mail, mais rápido de digitar.
                </span>
              </Row>
              <Row
                term="Senha"
                action={
                  <Button className="min-h-9" onClick={() => setOpen("password")}>
                    Trocar
                  </Button>
                }
              >
                <span aria-label="Senha oculta" className="font-medium tracking-[0.2em]">
                  ••••••••••••
                </span>
                <span className="text-xs text-muted">
                  Guardada só como hash (Argon2): nem o app consegue ler a senha, só conferir.
                </span>
              </Row>
              <Row
                term="Verificação em duas etapas"
                action={
                  profile.totp_enabled ? (
                    <Button variant="danger" className="min-h-9" onClick={() => setOpen("totp-off")}>
                      Desativar
                    </Button>
                  ) : (
                    <Button variant="primary" className="min-h-9" onClick={() => setOpen("totp-on")}>
                      Ativar
                    </Button>
                  )
                }
              >
                <span>
                  {profile.totp_enabled ? (
                    <Pill status="ok">Ativada</Pill>
                  ) : (
                    <Pill status="warn">Desativada</Pill>
                  )}
                </span>
                <span className="text-xs text-muted">
                  {profile.totp_enabled
                    ? "O login pede o código do app autenticador, além da senha."
                    : "Com ela, só a senha não basta para entrar: o login pede um código do celular."}
                </span>
              </Row>
              <Row term="Sessão">
                <span className="font-medium">Expira em {profile.session_minutes} minutos</span>
                <span className="text-xs text-muted">
                  Também termina ao fechar a aba. Trocar a senha não derruba a sessão aberta.
                </span>
              </Row>
            </dl>
          </Card>

          <Card data-enter>
            <CardTitle icon={KeyRound} color="var(--cat-fin)" hint="do arquivo .env">
              Chaves
            </CardTitle>
            <ul className="grid divide-y divide-border">
              {profile.keys.map((k) => (
                <li key={k.env} className="grid gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span style={{ color: STATUS_COLOR[k.status] }}>
                      <StatusShape status={k.status} />
                    </span>
                    <span className="font-semibold">{k.label}</span>
                    <span className="ml-auto font-mono text-xs text-muted">
                      {k.hint ?? (k.configured ? "configurada" : "faltando")}
                    </span>
                  </div>
                  <p className="pl-5 text-xs text-muted">
                    <code className="font-mono">{k.env}</code> · {k.purpose}
                  </p>
                  {k.note && (
                    <p
                      className="pl-5 text-xs font-medium"
                      style={{ color: STATUS_COLOR[k.status] }}
                    >
                      {k.note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-control bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted">
              Para trocar uma chave, edite o .env e reinicie o backend. Por segurança, o app não
              mostra nem altera as chaves por aqui.
              {profile.storage.env_files.map((f) => (
                <code key={f} className="mt-1 block font-mono break-all text-foreground">
                  {f}
                </code>
              ))}
            </p>
          </Card>

          <MascotCard />

          <NotificationsCard />

          <Card data-enter className="lg:col-span-2">
            <CardTitle icon={HardDrive} color="var(--cat-home)" hint="nada vai para a nuvem">
              Dados neste computador
            </CardTitle>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Fact term="Banco de dados">
                {profile.storage.database_bytes !== null
                  ? bytes(profile.storage.database_bytes)
                  : "—"}
              </Fact>
              <Fact term="Backups do banco">{profile.storage.backups}</Fact>
              <Fact term="Bancos conectados">{profile.connections}</Fact>
              <div className="grid gap-0.5 sm:col-span-3">
                <dt className="text-xs text-muted">Pasta</dt>
                <dd className="font-mono text-xs break-all">
                  {profile.storage.database ?? profile.storage.data_dir}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {open === "email" && profile && (
        <EmailDialog
          current={profile.email}
          onClose={() => setOpen(null)}
          onDone={() => saved("E-mail trocado. Use o novo no próximo login.")}
        />
      )}
      {open === "username" && profile && (
        <UsernameDialog
          current={profile.username}
          onClose={() => setOpen(null)}
          onDone={() => saved("Nome de usuário salvo. Já dá para entrar com ele.")}
        />
      )}
      {open === "password" && (
        <PasswordDialog onClose={() => setOpen(null)} onDone={() => saved("Senha trocada.")} />
      )}
      {open === "totp-on" && (
        <TotpOnDialog
          onClose={() => setOpen(null)}
          onDone={() => saved("Verificação em duas etapas ativada.")}
        />
      )}
      {open === "totp-off" && (
        <TotpOffDialog
          onClose={() => setOpen(null)}
          onDone={() => saved("Verificação em duas etapas desativada.")}
        />
      )}
    </div>
  );
}

/** Escolha do mascote: vale para o app todo e dá nome ao assistente. Salva na hora. */
function MascotCard() {
  const { id: current, setMascot } = useMascot();
  const [saving, setSaving] = useState(false);

  async function choose(id: MascotId) {
    if (id === current || saving) return;
    const previous = current;
    setMascot(id); // troca já na tela; volta se o backend recusar
    setSaving(true);
    try {
      await api("/profile/mascot", { method: "PUT", body: JSON.stringify({ mascot: id }) });
      notify(`Agora quem te acompanha é o ${MASCOTS[id].name}.`, "ok", { mood: "happy" });
    } catch (e) {
      setMascot(previous);
      notify(e instanceof Error ? e.message : String(e), "bad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-enter className="lg:col-span-2">
      <CardTitle icon={Smile} color="var(--cat-care)" hint="também é o nome do assistente">
        Mascote
      </CardTitle>
      <div role="radiogroup" aria-label="Mascote" className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(MASCOTS) as MascotId[]).map((id) => {
          const m = MASCOTS[id];
          const active = id === current;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(id)}
              className={cx(
                "flex items-center gap-3 rounded-control border p-3 text-left",
                "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                active
                  ? "border-accent bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))]"
                  : "border-border hover:bg-surface-2",
              )}
            >
              <Pila mascot={id} mood={active ? "happy" : "neutral"} size={64} />
              <span className="grid min-w-0 gap-0.5">
                <span className="flex items-center gap-2 font-semibold">
                  {m.name}
                  {active && <Pill status="ok">Em uso</Pill>}
                </span>
                <span className="text-xs text-muted">
                  O {m.animal}. {m.about}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Row({ term, action, children }: { term: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
      <div className="grid min-w-0 flex-1 gap-1">
        <dt className="text-xs text-muted">{term}</dt>
        <dd className="grid gap-1">{children}</dd>
      </div>
      {action}
    </div>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted">{term}</dt>
      <dd className="text-lg font-semibold tabular">{children}</dd>
    </div>
  );
}

// --- diálogos --------------------------------------------------------------------

const codeProps = {
  inputMode: "numeric",
  autoComplete: "one-time-code",
  pattern: "[0-9]{6}",
  maxLength: 6,
  placeholder: "000000",
  className: "tabular tracking-[0.3em]",
} as const;

function EmailDialog({
  current,
  onClose,
  onDone,
}: {
  current: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState(current);
  const [password, setPassword] = useState("");
  return (
    <FormDialog
      title="Trocar e-mail"
      submit="Salvar e-mail"
      onClose={onClose}
      onDone={onDone}
      onSubmit={() =>
        email.trim().toLowerCase() === current
          ? "Esse já é o seu e-mail."
          : api("/profile/email", {
              method: "PUT",
              body: JSON.stringify({ email: email.trim(), password }),
            })
      }
    >
      <Field
        label="Novo e-mail"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        hint="É o que você digita no login."
      />
      <Field
        label="Senha atual"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </FormDialog>
  );
}

function UsernameDialog({
  current,
  onClose,
  onDone,
}: {
  current: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [username, setUsername] = useState(current ?? "");
  const [password, setPassword] = useState("");
  const value = username.trim().toLowerCase();
  return (
    <FormDialog
      title={current ? "Trocar nome de usuário" : "Criar nome de usuário"}
      submit="Salvar"
      onClose={onClose}
      onDone={onDone}
      onSubmit={() =>
        value === (current ?? "")
          ? "Esse já é o seu nome de usuário."
          : value && !/^[a-z0-9](?:[a-z0-9._-]{1,22})[a-z0-9]$/.test(value)
            ? "Use de 3 a 24 caracteres: letras sem acento, números, ponto, hífen ou sublinhado."
            : api("/profile/username", {
                method: "PUT",
                body: JSON.stringify({ username: value || null, password }),
              })
      }
    >
      <Field
        label="Nome de usuário"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required={false}
        placeholder="ex.: daniel"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        hint={
          current
            ? "Deixe vazio para entrar só pelo e-mail."
            : "De 3 a 24 caracteres: letras sem acento, números, ponto, hífen ou sublinhado."
        }
      />
      <Field
        label="Senha atual"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </FormDialog>
  );
}

function PasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <FormDialog
      title="Trocar senha"
      submit="Salvar senha"
      onClose={onClose}
      onDone={onDone}
      onSubmit={() =>
        next.length < 12
          ? "Use pelo menos 12 caracteres."
          : next !== confirm
            ? "As senhas novas não conferem."
            : api("/profile/password", {
                method: "PUT",
                body: JSON.stringify({ current, new: next }),
              })
      }
    >
      <Field
        label="Senha atual"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <Field
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        minLength={12}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        hint="Pelo menos 12 caracteres. Uma frase com espaços é fácil de lembrar e difícil de adivinhar."
      />
      <Field
        label="Repita a nova senha"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
    </FormDialog>
  );
}

function TotpOnDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    api<TotpSetup>("/profile/totp/setup", { method: "POST" })
      .then(setSetup)
      .catch((e) => setFailed(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <FormDialog
      title="Ativar verificação em duas etapas"
      submit="Ativar"
      onClose={onClose}
      onDone={onDone}
      onSubmit={() =>
        !setup
          ? "Ainda gerando o código."
          : api("/profile/totp/enable", {
              method: "POST",
              body: JSON.stringify({ password, secret: setup.secret, code }),
            })
      }
    >
      <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted">
        <li>Abra um app autenticador (Google Authenticator, 1Password, Authy…).</li>
        <li>Escaneie o código abaixo ou digite a chave.</li>
        <li>Confirme com o código de 6 números que o app mostrar.</li>
      </ol>
      {failed && <ErrorNote>{failed}</ErrorNote>}
      {setup ? (
        <div className="flex flex-wrap items-center gap-4">
          {/* QR gerado no backend, sem serviço externo; fundo branco para a câmera ler no tema escuro */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qr_svg}
            alt="QR code para o app autenticador"
            className="size-40 rounded-control bg-white p-1"
          />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <span className="text-xs text-muted">Ou digite a chave</span>
            <code className="font-mono text-sm font-semibold">
              {setup.secret.match(/.{1,4}/g)?.join(" ")}
            </code>
            <Button
              type="button"
              variant="ghost"
              className="min-h-8 justify-self-start px-2"
              onClick={() =>
                navigator.clipboard
                  .writeText(setup.secret)
                  .then(() => notify("Chave copiada."))
                  .catch(() => null)
              }
            >
              <Copy />
              Copiar chave
            </Button>
          </div>
        </div>
      ) : (
        !failed && <p className="text-sm text-muted">Gerando…</p>
      )}
      <Field label="Código do app" value={code} onChange={(e) => setCode(e.target.value)} {...codeProps} />
      <Field
        label="Senha atual"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <p className="text-xs text-muted">
        Guarde a chave num lugar seguro: sem o celular, ela é o jeito de recuperar o acesso.
      </p>
    </FormDialog>
  );
}

function TotpOffDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  return (
    <FormDialog
      title="Desativar verificação em duas etapas?"
      submit="Desativar"
      destructive
      onClose={onClose}
      onDone={onDone}
      onSubmit={() =>
        api("/profile/totp/disable", {
          method: "POST",
          body: JSON.stringify({ password, code }),
        })
      }
    >
      <p className="text-sm text-muted">
        O login volta a pedir só a senha. Dá para ativar de novo quando quiser, com uma chave nova.
      </p>
      <Field label="Código do app" value={code} onChange={(e) => setCode(e.target.value)} {...codeProps} />
      <Field
        label="Senha atual"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </FormDialog>
  );
}
