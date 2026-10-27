import type { ReactNode } from "react";

import { cx } from "@/components/ui";

/** Desenho simplificado de uma página de fora (painel da Pluggy etc.): mostra onde clicar. */
export function BrowserSketch({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface" aria-hidden>
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3.5 py-2.5">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-2.5 truncate rounded-chip bg-background px-2.5 py-1 text-xs text-muted">{url}</span>
      </div>
      {children}
    </div>
  );
}

/** Traço cinza no lugar de um texto que não importa. */
export function Bar({ className }: { className?: string }) {
  return <span className={cx("block h-2.5 rounded-[4px] bg-border", className)} />;
}

/** Marcador rosa numerado: a ordem dos cliques (o número bate com a lista do passo). */
export function Marker({ n, className }: { n: number | string; className?: string }) {
  return (
    <span
      className={cx(
        "absolute grid size-6 place-items-center rounded-full bg-[var(--pila-body)] text-xs font-extrabold text-[var(--pila-ink)]",
        className,
      )}
    >
      {n}
    </span>
  );
}

/** Letra dourada que liga um campo do desenho ao campo do formulário (A → Client ID). */
export function FieldTag({ children }: { children: ReactNode }) {
  return <span className="font-extrabold text-[var(--coin)]">{children}</span>;
}

/** Uma moeda por passo: cheia (feito), anel (agora), tracejada (falta). */
export function CoinTrail({ total, current }: { total: number; current: number }) {
  return (
    <ol className="flex items-center gap-2.5" aria-label={`Passo ${current + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <li
          key={i}
          aria-hidden
          className={cx(
            "size-[22px] rounded-full",
            i < current && "border-2 border-[var(--coin-line)] bg-[var(--coin)]",
            i === current && "border-[2.5px] border-[var(--coin)]",
            i > current && "border-2 border-dashed border-[var(--series-ref)]",
          )}
        />
      ))}
    </ol>
  );
}
