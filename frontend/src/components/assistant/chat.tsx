"use client";

import { Loader2, SendHorizontal, Square } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Pila, PilaSays } from "@/components/pila";
import { ErrorNote, cx, tone } from "@/components/ui";
import { useAssistant } from "./context";

const SUGGESTIONS = [
  "Como foi meu último ciclo?",
  "Quanto dá para gastar até o fim do ciclo?",
  "Onde estou gastando mais?",
  "Que padrões você vê nas minhas finanças?",
  "Posso comprar algo da lista de desejos?",
];

/**
 * A conversa com o Pila: falas, sugestões e o campo de pergunta. Ocupa a altura que o pai der
 * (as falas rolam por dentro). Usada na aba Assistente e no painel do botão flutuante.
 */
export function ChatView({
  inputId,
  compact,
  setup,
}: {
  inputId: string;
  /** Painel do botão: Pila menor e menos sugestões */
  compact?: boolean;
  /** O que dizer quando o modelo não está pronto (onde configurar) */
  setup: ReactNode;
}) {
  const { status, ready, turns, busy, ask, stop } = useAssistant();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // Acompanha a resposta enquanto ela chega
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  function send(text: string) {
    if (!text.trim() || busy || !ready) return;
    ask(text);
    setDraft("");
  }

  // O campo cresce com o texto (até ~6 linhas) e começa com a altura do botão
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        ref={scroller}
        className={cx(
          "min-h-0 flex-1 overflow-y-auto",
          // Na aba, a conversa ganha um painel próprio; no painel do botão, fica solta
          compact ? "-mx-1 px-1" : "rounded-control bg-surface-2/60 p-4 sm:p-5",
        )}
        aria-live="polite"
      >
        {turns.length === 0 ? (
          <div className="grid h-full content-center justify-items-center gap-5 py-4 text-center">
            <PilaSays mood={ready ? "happy" : "sleep"} size={compact ? 64 : 104}>
              {ready
                ? "Pergunte sobre as suas contas. Eu consulto o app e explico."
                : status && !status.ollama
                  ? "Abra o Ollama para eu acordar."
                  : status
                    ? "Preciso de um modelo baixado para conversar."
                    : "Não consegui falar com o app."}
            </PilaSays>
            {ready ? (
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {(compact ? SUGGESTIONS.slice(0, 3) : SUGGESTIONS).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-border bg-surface px-3.5 py-2 text-sm transition-colors duration-[var(--dur-fast)] hover:border-accent hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted">{setup}</div>
            )}
          </div>
        ) : (
          <div className="grid content-start gap-4">
            {turns.map((t, i) =>
              t.role === "user" ? (
                <p
                  key={i}
                  style={tone("var(--accent)")}
                  className="tint max-w-[85%] justify-self-end rounded-card rounded-br-[4px] px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground"
                >
                  {t.content}
                </p>
              ) : (
                <div key={i} className="flex max-w-[92%] items-start gap-2.5">
                  <span className="mt-1 shrink-0">
                    <Pila size={compact ? 28 : 34} mood={t.error ? "worried" : "neutral"} />
                  </span>
                  <div
                    className={cx(
                      "grid min-w-0 gap-2 rounded-card rounded-tl-[4px] px-3.5 py-2.5 text-[15px] leading-relaxed",
                      compact ? "bg-surface-2" : "bg-surface",
                    )}
                  >
                    {t.tools && t.tools.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5 text-xs text-muted">
                        {t.tools.map((label, j) => (
                          <li key={j} className="rounded-full border border-border px-2 py-0.5">
                            {label}
                          </li>
                        ))}
                      </ul>
                    )}
                    {t.content ? (
                      <Rich text={t.content} />
                    ) : (
                      !t.error &&
                      busy &&
                      i === turns.length - 1 && (
                        <span className="flex items-center gap-2 text-muted">
                          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
                          Pensando…
                        </span>
                      )
                    )}
                    {t.error && <ErrorNote>{t.error}</ErrorNote>}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <form
        className="grid gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        {/* Campo e botão numa caixa só, com a mesma altura: o botão fica dentro, à direita */}
        <div
          className={cx(
            "flex items-end gap-2 rounded-card border border-border bg-surface p-1.5 pl-4",
            "transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
            "focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_25%,transparent)]",
            !ready && "opacity-60",
          )}
        >
          <label htmlFor={inputId} className="sr-only">
            Pergunta para o Pila
          </label>
          <textarea
            ref={input}
            id={inputId}
            rows={1}
            disabled={!ready}
            value={draft}
            maxLength={4000}
            placeholder={ready ? "Pergunte ao Pila…" : "Assistente indisponível"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            className="min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Parar a resposta"
              title="Parar"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-foreground transition-colors duration-[var(--dur-fast)] hover:bg-[color-mix(in_oklab,var(--surface-2)_85%,var(--foreground))] [&_svg]:size-4"
            >
              <Square />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!ready || !draft.trim()}
              aria-label="Enviar"
              title="Enviar (Enter)"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg transition-colors duration-[var(--dur-fast)] hover:bg-[color-mix(in_oklab,var(--accent)_88%,var(--foreground))] disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4"
            >
              <SendHorizontal />
            </button>
          )}
        </div>
        <p className="px-1 text-xs text-muted">
          Enter envia, Shift+Enter quebra a linha. Roda no seu computador; a conversa some ao recarregar o app.
        </p>
      </form>
    </div>
  );
}

/** Markdown mínimo das respostas: parágrafos, listas e **negrito**. */
function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="grid list-disc gap-1 pl-5">
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const line of text.split("\n")) {
    const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (line.trim())
      blocks.push(
        <p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>,
      );
  }
  flush();
  return <div className="grid gap-2">{blocks}</div>;
}

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
