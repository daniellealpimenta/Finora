"use client";

import {
  Cpu,
  Download,
  Info,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ChatView } from "@/components/assistant/chat";
import { useAssistant } from "@/components/assistant/context";
import { Dialog } from "@/components/dialog";
import { Pila } from "@/components/pila";
import {
  Button,
  Card,
  CardTitle,
  ErrorNote,
  Meter,
  PageHeader,
  Pill,
  StatusShape,
  cx,
  tone,
} from "@/components/ui";
import {
  api,
  type AssistantModel,
  type AssistantStatus,
  type Insight,
} from "@/lib/api";
import { usePageEnter } from "@/lib/motion";
import { notify } from "@/lib/signals";

const COLOR = "var(--cat-fin)";

const gb = (bytes: number) =>
  `${(bytes / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;

export default function AssistentePage() {
  const { status, ready, ask, turns, busy, clear } = useAssistant();
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const inputId = useId();

  usePageEnter(root, status !== null);

  useEffect(() => {
    api<Insight[]>("/assistant/insights")
      .then(setInsights)
      .catch(() => setInsights([]));
  }, []);

  const active = status?.models.find((m) => m.name === status.active_model);

  return (
    <div ref={root}>
      <PageHeader
        title="Assistente"
        description="O Pila responde sobre as suas contas com um modelo que roda só no seu computador. Nada sai da máquina."
      />
      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {status && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card data-enter className="flex h-[min(760px,calc(100dvh-170px))] min-h-[540px] flex-col gap-4">
            <div className="flex items-center gap-3">
              <Pila size={44} mood={ready ? "happy" : "sleep"} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-[-0.01em]">Converse com o Pila</h2>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <span
                    className={cx("size-2 rounded-full", ready ? "bg-positive" : "bg-muted")}
                    aria-hidden
                  />
                  {ready
                    ? `${active?.label}, rodando no seu computador`
                    : status.ollama
                      ? "Nenhum modelo baixado"
                      : "Ollama fechado"}
                </p>
              </div>
              {turns.length > 0 && !busy && (
                <Button variant="ghost" className="min-h-9" onClick={clear}>
                  Limpar
                </Button>
              )}
            </div>
            <ChatView
              inputId={inputId}
              setup="Baixe um modelo no card Modelo para eu conseguir conversar."
            />
          </Card>
          <div className="grid gap-4">
            <InsightsCard insights={insights} canAsk={ready} onAsk={ask} />
            <ModelsCard status={status} onError={setError} />
          </div>
        </div>
      )}
    </div>
  );
}

// --- padrões --------------------------------------------------------------------

function InsightsCard({
  insights,
  canAsk,
  onAsk,
}: {
  insights: Insight[] | null;
  canAsk: boolean;
  onAsk: (text: string) => void;
}) {
  return (
    <Card data-enter>
      <CardTitle icon={Sparkles} color={COLOR} hint="calculados pelo app">
        Padrões encontrados
      </CardTitle>
      {insights === null ? (
        <p className="text-sm text-muted">Procurando…</p>
      ) : insights.length === 0 ? (
        <p className="text-sm text-muted">Nada fora do normal por enquanto.</p>
      ) : (
        <ul className="grid gap-2">
          {insights.map((i, n) => (
            <li
              key={n}
              style={i.severity === "warn" ? tone("var(--warning)") : undefined}
              className={cx(
                "grid gap-1 rounded-control px-3 py-2.5 text-sm",
                i.severity === "warn" ? "tint" : "border border-border",
              )}
            >
              <span className="flex items-start gap-2 font-medium">
                {i.severity === "info" ? (
                  <Info
                    className="mt-0.5 size-3.5 shrink-0 text-muted"
                    aria-hidden
                  />
                ) : (
                  <StatusShape
                    status={i.severity === "warn" ? "warn" : "ok"}
                    className={cx(
                      "mt-1",
                      i.severity === "good" && "text-positive",
                    )}
                  />
                )}
                {i.title}
              </span>
              <span
                className={cx(
                  "pl-5 text-xs leading-relaxed",
                  i.severity !== "warn" && "text-muted",
                )}
              >
                {i.detail}
              </span>
              {canAsk && (
                <button
                  type="button"
                  onClick={() =>
                    onAsk(
                      `Me explique este ponto e o que posso fazer: ${i.title}. ${i.detail}`,
                    )
                  }
                  className="justify-self-start pl-5 text-xs font-semibold text-accent hover:underline"
                >
                  Perguntar ao Pila
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- modelos --------------------------------------------------------------------

function ModelsCard({
  status,
  onError,
}: {
  status: AssistantStatus;
  onError: (message: string | null) => void;
}) {
  const { setStatus, reload } = useAssistant();
  const [removing, setRemoving] = useState<AssistantModel | null>(null);
  const [checking, setChecking] = useState(false);
  const pull = status.pull;

  async function run(fn: () => Promise<unknown>, done?: string) {
    try {
      onError(null);
      await fn();
      await reload();
      if (done) notify(done);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card data-enter className="grid gap-4">
      <CardTitle icon={Cpu} color={COLOR} hint="via Ollama, nesta máquina">
        Modelo
      </CardTitle>

      {!status.ollama ? (
        <div className="grid gap-3 text-sm">
          <p className="flex items-start gap-2">
            <StatusShape status="warn" className="mt-1 text-warning" />O Ollama
            não está aberto. É ele que baixa e roda o modelo no seu Mac.
          </p>
          <ol className="grid list-decimal gap-1.5 pl-5 text-muted">
            <li>
              Baixe em{" "}
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-accent underline underline-offset-2"
              >
                ollama.com/download
              </a>{" "}
              e arraste para Aplicativos.
            </li>
            <li>Abra o Ollama (ele fica na barra de menus).</li>
            <li>Volte aqui e verifique de novo.</li>
          </ol>
          <Button
            className="justify-self-start"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await reload().catch(() => null);
              setChecking(false);
            }}
          >
            <RefreshCw className={cx(checking && "motion-safe:animate-spin")} />
            Verificar de novo
          </Button>
        </div>
      ) : (
        <ul className="grid divide-y divide-border">
          {status.models.map((m) => {
            const isActive = m.name === status.active_model;
            const thisPull = pull.model === m.name ? pull : null;
            const downloading = Boolean(thisPull?.running);
            const progress =
              thisPull && thisPull.total > 0
                ? thisPull.completed / thisPull.total
                : 0;
            return (
              <li key={m.name} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">{m.label}</span>
                  {m.name === "qwen3:8b" && (
                    <Pill status="ok">Recomendado</Pill>
                  )}
                  {m.installed && isActive && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold">
                      Em uso
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted tabular">
                    {m.size_gb.toLocaleString("pt-BR")} GB no disco · ~
                    {m.memory_gb} GB de memória
                  </span>
                </div>
                <p className="text-xs text-muted">{m.note}</p>

                {downloading ? (
                  <div className="grid gap-1.5">
                    <Meter
                      value={progress}
                      color={COLOR}
                      label={`Baixando ${m.label}`}
                    />
                    <div className="flex items-center justify-between gap-2 text-xs text-muted tabular">
                      <span>
                        {thisPull!.total > 0
                          ? `${gb(thisPull!.completed)} de ${gb(thisPull!.total)} (${Math.floor(progress * 100)}%)`
                          : "Preparando…"}
                      </span>
                      <Button
                        variant="ghost"
                        className="min-h-8 px-2"
                        onClick={() =>
                          run(() =>
                            api("/assistant/pull/cancel", { method: "POST" }),
                          )
                        }
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {!m.installed ? (
                      <Button
                        variant={
                          m.name === "qwen3:8b" ? "primary" : "secondary"
                        }
                        className="min-h-9"
                        disabled={pull.running}
                        onClick={() =>
                          run(() =>
                            api("/assistant/pull", {
                              method: "POST",
                              body: JSON.stringify({ model: m.name }),
                            }),
                          )
                        }
                      >
                        <Download />
                        Baixar
                      </Button>
                    ) : (
                      <>
                        {!isActive && (
                          <Button
                            className="min-h-9"
                            onClick={() =>
                              run(async () =>
                                setStatus(
                                  await api<AssistantStatus>(
                                    "/assistant/model",
                                    {
                                      method: "PUT",
                                      body: JSON.stringify({ model: m.name }),
                                    },
                                  ),
                                ),
                              )
                            }
                          >
                            Usar este
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          className="min-h-9"
                          onClick={() => setRemoving(m)}
                        >
                          <Trash2 />
                          Desinstalar
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {removing && (
        <Dialog
          title={`Desinstalar ${removing.label}?`}
          onClose={() => setRemoving(null)}
        >
          {(close) => (
            <div className="grid gap-5">
              <p className="text-sm text-muted">
                Os arquivos do modelo são apagados e liberam{" "}
                {removing.size_gb.toLocaleString("pt-BR")} GB no disco. Suas
                contas e conversas não mudam. Dá para baixar de novo quando
                quiser.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => close()}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const target = removing;
                    close(() => {
                      setRemoving(null);
                      run(
                        () =>
                          api(
                            `/assistant/models/${encodeURIComponent(target.name)}`,
                            { method: "DELETE" },
                          ),
                        `${target.label} desinstalado.`,
                      );
                    });
                  }}
                >
                  Desinstalar
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </Card>
  );
}
