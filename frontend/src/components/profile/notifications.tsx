"use client";

import { Eye, Mail, Send } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Dialog } from "@/components/dialog";
import { Field, FormDialog } from "@/components/profile/form";
import { Button, Card, CardTitle, ErrorNote, Pill, cx } from "@/components/ui";
import { api, type Notifications } from "@/lib/api";
import { notify } from "@/lib/signals";

const GROUPS: { id: "calendar" | "event" | "alert"; label: string }[] = [
  { id: "calendar", label: "No calendário do ciclo" },
  { id: "event", label: "Quando algo muda" },
  { id: "alert", label: "Alertas" },
];

const DETAILS: { id: Notifications["detail"]; label: string; about: string }[] = [
  { id: "full", label: "Completo", about: "Valores, categorias e nomes das lojas." },
  { id: "totals", label: "Só os totais", about: "Valores, sem lojas nem transações." },
  { id: "discreet", label: "Discreto", about: "Nenhum número: só “abra o Finora”." },
];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Avisos por e-mail (Perfil): conta de envio, para onde vai, quanto mostra e quais avisos.
 * A senha de app nunca volta do backend; os avisos saem pelo agendador, no web e no programa.
 */
export function NotificationsCard() {
  const [data, setData] = useState<Notifications | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<"account" | "to" | "remove" | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(
    () =>
      api<Notifications>("/notifications")
        .then(setData)
        .catch((e) => setError(errorText(e))),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function change(body: Record<string, unknown>) {
    try {
      setData(await api<Notifications>("/notifications/config", { method: "PUT", body: JSON.stringify(body) }));
    } catch (e) {
      notify(errorText(e), "bad");
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const { to } = await api<{ to: string }>("/notifications/test", { method: "POST" });
      notify(`E-mail de teste enviado para ${to}. Confira a caixa de entrada (e o spam).`);
      load();
    } catch (e) {
      notify(errorText(e), "bad");
    } finally {
      setTesting(false);
    }
  }

  async function showPreview(kind: string) {
    try {
      setPreview(await api<{ subject: string; html: string }>(`/notifications/preview/${kind}`));
    } catch (e) {
      notify(errorText(e), "bad");
    }
  }

  async function importEnv() {
    try {
      setData(await api<Notifications>("/notifications/account/import-env", { method: "POST" }));
      notify("Conta salva no Perfil. Agora vale também no programa do Mac.");
    } catch (e) {
      notify(errorText(e), "bad");
    }
  }

  return (
    <Card data-enter className="grid gap-5 lg:col-span-2">
      <CardTitle icon={Mail} color="var(--cat-home)" hint="saem do seu Gmail, só com o Finora aberto">
        Avisos por e-mail
      </CardTitle>
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && (
        <>
          {/* Conta de envio */}
          <section className="flex flex-wrap items-start gap-3 rounded-control bg-surface-2 p-4">
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="text-xs text-muted">Conta de envio</span>
              {data.account ? (
                <>
                  <span className="font-semibold break-all">{data.account.user}</span>
                  <span className="text-xs text-muted">
                    {data.account.source === "profile"
                      ? `${data.account.host}:${data.account.port}, senha de app guardada criptografada neste computador.`
                      : "Lida do .env do projeto: funciona no modo web, mas não no programa do Mac. Salve no Perfil para valer nos dois."}
                  </span>
                </>
              ) : (
                <span className="text-sm">
                  Nenhuma ainda. Use um Gmail com senha de app: os avisos saem dele para o seu e-mail.
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {data.account?.source === "env" && (
                <Button variant="primary" className="min-h-9" onClick={importEnv}>
                  Salvar no Perfil
                </Button>
              )}
              <Button
                variant={data.account ? "secondary" : "primary"}
                className="min-h-9"
                onClick={() => setOpen("account")}
              >
                {data.account ? "Trocar" : "Configurar"}
              </Button>
              {data.account?.source === "profile" && (
                <Button variant="danger" className="min-h-9" onClick={() => setOpen("remove")}>
                  Remover
                </Button>
              )}
            </div>
          </section>

          {data.last_error && (
            <ErrorNote>
              O último envio falhou ({new Date(data.last_error.at).toLocaleString("pt-BR")}):{" "}
              {data.last_error.message}
            </ErrorNote>
          )}

          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            <Setting
              label="Avisos ligados"
              about={data.account ? "Desligue para pausar todos os e-mails." : "Configure a conta de envio para começar."}
              control={<Switch label="Avisos ligados" on={data.enabled} onChange={(v) => change({ enabled: v })} />}
            />
            <Setting
              label="Enviar para"
              about={data.to ? "Outro endereço." : "O e-mail da sua conta."}
              control={
                <Button variant="ghost" className="min-h-9 px-2" onClick={() => setOpen("to")}>
                  Trocar
                </Button>
              }
            >
              <span className="font-medium break-all">{data.to ?? data.default_to ?? "—"}</span>
            </Setting>
            <Setting
              label="Silêncio à noite"
              about="Das 22h às 8h os avisos esperam e saem de manhã."
              control={<Switch label="Silêncio à noite" on={data.quiet} onChange={(v) => change({ quiet: v })} />}
            />
            <div className="grid gap-2">
              <span className="text-sm font-semibold">Quanto o e-mail mostra</span>
              <div role="radiogroup" aria-label="Quanto o e-mail mostra" className="inline-flex w-fit flex-wrap rounded-control bg-surface-2 p-0.5 text-sm font-semibold">
                {DETAILS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={data.detail === d.id}
                    onClick={() => change({ detail: d.id })}
                    className={cx(
                      "min-h-9 rounded-[calc(var(--radius-control)-2px)] px-3.5 transition-colors duration-[var(--dur-fast)]",
                      data.detail === d.id ? "bg-surface text-foreground" : "text-muted hover:text-foreground",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted">
                {DETAILS.find((d) => d.id === data.detail)?.about} Os e-mails passam pelo Google e ficam no Gmail.
              </span>
            </div>
          </div>

          {/* Quais avisos */}
          <div className="grid gap-4 md:grid-cols-3">
            {GROUPS.map((g) => (
              <section key={g.id} className="grid content-start gap-1">
                <h3 className="mb-1 text-sm font-semibold">{g.label}</h3>
                <ul className="grid divide-y divide-border">
                  {data.catalog
                    .filter((k) => k.group === g.id)
                    .map((k) => (
                      <li key={k.id} className="flex items-start gap-3 py-2.5">
                        <div className="grid min-w-0 flex-1 gap-0.5">
                          <span className="text-sm font-medium">{k.label}</span>
                          <span className="text-xs text-muted">{k.about}</span>
                          <button
                            type="button"
                            onClick={() => showPreview(k.id)}
                            className="flex w-fit items-center gap-1 text-xs font-semibold text-accent hover:underline [&_svg]:size-3.5"
                          >
                            <Eye aria-hidden />
                            Ver exemplo
                          </button>
                        </div>
                        <Switch
                          label={k.label}
                          on={data.kinds[k.id] ?? true}
                          onChange={(v) => change({ kinds: { [k.id]: v } })}
                        />
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={sendTest} disabled={!data.account || testing}>
              <Send />
              {testing ? "Enviando…" : "Enviar e-mail de teste"}
            </Button>
            <span className="text-xs text-muted">
              Os avisos são conferidos a cada 15 minutos. Com o computador desligado, saem quando o Finora abrir.
            </span>
          </div>

          {data.log.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold">Últimos envios</summary>
              <ul className="mt-2 grid divide-y divide-border">
                {data.log.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="w-32 shrink-0 text-xs text-muted tabular">
                      {new Date(e.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <span className="min-w-0 flex-1">{e.subject ?? e.kind}</span>
                    {e.status === "sent" ? <Pill status="ok">Enviado</Pill> : <Pill status="warn">{e.status}</Pill>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {open === "account" && (
            <AccountDialog current={data.account} onClose={() => setOpen(null)} onDone={(d) => setData(d)} />
          )}
          {open === "to" && (
            <ToDialog
              current={data.to}
              fallback={data.default_to}
              onClose={() => setOpen(null)}
              onDone={(d) => setData(d)}
            />
          )}
          {open === "remove" && (
            <FormDialog
              title="Remover a conta de envio?"
              submit="Remover"
              destructive
              onClose={() => setOpen(null)}
              onDone={() => notify("Conta de envio removida. Os avisos pararam.")}
              onSubmit={() => api<Notifications>("/notifications/account", { method: "DELETE" }).then(setData)}
            >
              <p className="text-sm text-muted">
                A senha de app sai deste computador e os avisos param. Para revogar de vez, apague
                a senha de app “Finora” na sua Conta do Google.
              </p>
            </FormDialog>
          )}
        </>
      )}

      {preview && (
        <Dialog title={preview.subject} size="lg" onClose={() => setPreview(null)}>
          {() => (
            <div className="grid gap-2">
              <p className="text-xs text-muted">
                Com os seus números de agora. O comentário do mascote é escrito na hora do envio.
              </p>
              {/* sandbox vazio: o HTML do e-mail não roda script nem navega */}
              <iframe
                title={`Exemplo: ${preview.subject}`}
                srcDoc={preview.html}
                sandbox=""
                className="h-[min(640px,65dvh)] w-full rounded-control border border-border bg-white"
              />
            </div>
          )}
        </Dialog>
      )}
    </Card>
  );
}

function Setting({
  label,
  about,
  control,
  children,
}: {
  label: string;
  about: string;
  control: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-sm font-semibold">{label}</span>
        {children}
        <span className="text-xs text-muted">{about}</span>
      </div>
      {control}
    </div>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-[var(--dur-fast)]",
        on ? "bg-accent" : "bg-[color-mix(in_oklab,var(--muted)_35%,var(--surface-2))]",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-sm transition-transform duration-[var(--dur-fast)]",
          on && "translate-x-4",
        )}
      />
    </button>
  );
}

function AccountDialog({
  current,
  onClose,
  onDone,
}: {
  current: Notifications["account"];
  onClose: () => void;
  onDone: (d: Notifications) => void;
}) {
  const keep = current?.source === "profile";
  const [user, setUser] = useState(current?.user ?? "");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(current?.host ?? "smtp.gmail.com");
  const [port, setPort] = useState(String(current?.port ?? 587));
  return (
    <FormDialog
      title={current ? "Trocar a conta de envio" : "Configurar a conta de envio"}
      submit="Conferir e salvar"
      onClose={onClose}
      onDone={() => notify("Conta de envio salva. Mande um e-mail de teste para conferir.")}
      onSubmit={() =>
        !keep && !password.trim()
          ? "Informe a senha de app."
          : api<Notifications>("/notifications/account", {
              method: "PUT",
              body: JSON.stringify({
                user: user.trim(),
                password: password.trim() || null,
                host: host.trim(),
                port: Number(port),
              }),
            }).then(onDone)
      }
    >
      <p className="text-sm text-muted">
        Os avisos saem desta conta. No Gmail: ative a verificação em duas etapas e crie uma senha de
        app chamada “Finora” em myaccount.google.com/apppasswords. A senha normal não funciona.
      </p>
      <Field
        label="E-mail que envia"
        type="email"
        autoComplete="off"
        placeholder="voce.finora@gmail.com"
        value={user}
        onChange={(e) => setUser(e.target.value)}
      />
      <Field
        label="Senha de app"
        type="password"
        autoComplete="new-password"
        required={!keep}
        placeholder={keep ? "Deixe vazio para manter a atual" : "16 letras"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="Fica criptografada neste computador e nunca é mostrada de novo."
      />
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Servidor (outros provedores)</summary>
        <div className="mt-3 grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Servidor SMTP" value={host} onChange={(e) => setHost(e.target.value)} />
          <Field label="Porta" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} />
        </div>
      </details>
      <p className="text-xs text-muted">Ao salvar, o Finora entra na conta para conferir (sem enviar nada).</p>
    </FormDialog>
  );
}

function ToDialog({
  current,
  fallback,
  onClose,
  onDone,
}: {
  current: string | null;
  fallback: string | null;
  onClose: () => void;
  onDone: (d: Notifications) => void;
}) {
  const [to, setTo] = useState(current ?? "");
  return (
    <FormDialog
      title="Para onde vão os avisos"
      submit="Salvar"
      onClose={onClose}
      onDone={() => notify("Destino dos avisos salvo.")}
      onSubmit={() =>
        api<Notifications>("/notifications/config", {
          method: "PUT",
          body: JSON.stringify(to.trim() ? { to: to.trim() } : { clear_to: true }),
        }).then(onDone)
      }
    >
      <Field
        label="Enviar para"
        type="email"
        required={false}
        placeholder={fallback ?? "voce@exemplo.com"}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        hint={`Vazio: usa o e-mail da sua conta${fallback ? ` (${fallback})` : ""}.`}
      />
    </FormDialog>
  );
}
