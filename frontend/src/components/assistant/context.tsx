"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  api,
  streamChat,
  type AssistantStatus,
  type ChatMessage,
} from "@/lib/api";
import { notify } from "@/lib/signals";

/** Uma fala da conversa. As do Pila guardam as consultas feitas e o erro, se houver. */
export type Turn = ChatMessage & { tools?: string[]; error?: string };

type Assistant = {
  /** null enquanto carrega (ou se o backend não respondeu) */
  status: AssistantStatus | null;
  setStatus: (s: AssistantStatus) => void;
  reload: () => Promise<AssistantStatus | null>;
  /** Ollama aberto e o modelo escolhido baixado */
  ready: boolean;
  turns: Turn[];
  busy: boolean;
  ask: (text: string) => void;
  /** Carrega o modelo em segundo plano (conversa abriu, campo em foco): a primeira resposta
   * sai em ~9 s em vez de ~20 s. O backend ignora se ele já estiver quente. */
  warm: () => void;
  stop: () => void;
  clear: () => void;
};

const Ctx = createContext<Assistant | null>(null);

export function useAssistant(): Assistant {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssistant fora do AssistantProvider");
  return ctx;
}

/**
 * Estado do assistente para o app inteiro: a aba e o botão flutuante mostram a mesma conversa,
 * que continua ao trocar de página. Nada vai para o servidor além da pergunta: a conversa some
 * ao recarregar.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    try {
      const s = await api<AssistantStatus>("/assistant/status");
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    reload();
    return () => abort.current?.abort();
  }, [reload]);

  // Download em andamento: acompanha mesmo fora da aba, avisa no fim e passa a usar o modelo
  // se o escolhido ainda não estava baixado
  const pulling = Boolean(status?.pull.running);
  useEffect(() => {
    if (!pulling) return;
    const timer = setInterval(async () => {
      const s = await reload();
      if (!s || s.pull.running) return;
      clearInterval(timer);
      const name =
        s.models.find((m) => m.name === s.pull.model)?.label ?? s.pull.model;
      if (s.pull.error) {
        notify(`O download de ${name} parou: ${s.pull.error}`, "bad");
        return;
      }
      notify(`${name} baixado. Já dá para conversar.`);
      const active = s.models.find((m) => m.name === s.active_model);
      if (!active?.installed && s.pull.model) {
        const updated = await api<AssistantStatus>("/assistant/model", {
          method: "PUT",
          body: JSON.stringify({ model: s.pull.model }),
        }).catch(() => null);
        if (updated) setStatus(updated);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [pulling, reload]);

  const active = status?.models.find((m) => m.name === status.active_model);
  const ready = Boolean(status?.ollama && active?.installed);

  const lastWarm = useRef(0);
  const warm = useCallback(() => {
    if (!ready || Date.now() - lastWarm.current < 60_000) return;
    lastWarm.current = Date.now();
    api("/assistant/warmup", { method: "POST" }).catch(() => null);
  }, [ready]);

  const update = (fn: (t: Turn) => Turn) =>
    setTurns((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy || !ready) return;
    const history: ChatMessage[] = [
      ...turns
        .filter((t) => !t.error && t.content)
        .map(({ role, content }) => ({ role, content })),
      { role: "user", content: question },
    ];
    setTurns((all) => [
      ...all,
      { role: "user", content: question },
      { role: "assistant", content: "", tools: [] },
    ]);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      await streamChat(
        history,
        (event) => {
          if (event.type === "text")
            update((t) => ({ ...t, content: t.content + event.delta }));
          else if (event.type === "tool")
            update((t) => ({ ...t, tools: [...(t.tools ?? []), event.label] }));
          else if (event.type === "error")
            update((t) => ({ ...t, error: event.message }));
        },
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted)
        update((t) => ({
          ...t,
          error: e instanceof Error ? e.message : String(e),
        }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <Ctx.Provider
      value={{
        status,
        setStatus,
        reload,
        ready,
        turns,
        busy,
        ask,
        warm,
        stop: () => abort.current?.abort(),
        clear: () => setTurns([]),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
