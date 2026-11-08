"use client";

import { ChartColumn, ChartLine, ChartPie, CircleDashed, List, Table, type LucideIcon } from "lucide-react";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

import { cx } from "@/components/ui";
import { money } from "@/lib/format";
import { FULL, gsap, useGSAP } from "@/lib/motion";
import { playSound } from "@/lib/sound";

/**
 * Visualizações de um mesmo card (2026-11-07): lista, rosca, barras, linha, anéis ou tabela. A
 * escolha fica no layout do painel (salvo no app), então cada card lembra como você prefere ver.
 */
export type ViewKind = "list" | "donut" | "bars" | "line" | "rings" | "table";

const VIEW_META: Record<ViewKind, { label: string; icon: LucideIcon }> = {
  list: { label: "Lista", icon: List },
  donut: { label: "Rosca", icon: ChartPie },
  bars: { label: "Barras", icon: ChartColumn },
  line: { label: "Linha", icon: ChartLine },
  rings: { label: "Anéis", icon: CircleDashed },
  table: { label: "Tabela", icon: Table },
};

type ViewStore = { views: Record<string, string>; setView: (id: string, view: string) => void };
export const PanelViews = createContext<ViewStore | null>(null);

/** [visualização atual, trocar]. Fora do painel (ou sem escolha salva) vale a primeira opção. */
export function useCardView<V extends ViewKind>(id: string, options: readonly V[]): [V, (v: V) => void] {
  const store = useContext(PanelViews);
  const [local, setLocal] = useState<V>(options[0]);
  const saved = store?.views[id] as V | undefined;
  const view = saved && options.includes(saved) ? saved : store ? options[0] : local;
  return [view, (v: V) => (store ? store.setView(id, v) : setLocal(v))];
}

/** Botõezinhos no título do card para trocar a visualização. */
export function ViewSwitch<V extends ViewKind>({
  options,
  value,
  onChange,
}: {
  options: readonly V[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <span role="group" aria-label="Visualização" className="inline-flex gap-0.5 rounded-control bg-surface-2 p-0.5">
      {options.map((v) => {
        const { label, icon: Icon } = VIEW_META[v];
        return (
          <button
            key={v}
            type="button"
            aria-pressed={v === value}
            aria-label={`Ver como ${label.toLowerCase()}`}
            title={label}
            onClick={() => {
              if (v === value) return;
              playSound("tap");
              onChange(v);
            }}
            className={cx(
              "grid size-8 place-items-center rounded-[8px] transition-colors duration-[var(--dur-fast)] [&_svg]:size-4",
              v === value ? "bg-surface text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            <Icon />
          </button>
        );
      })}
    </span>
  );
}

/** Troca de visualização com um fade curto, para a mudança não parecer um pulo. */
export function ViewFade({ view, children }: { view: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from(root.current, { autoAlpha: 0, y: 8, duration: 0.35, ease: "power3.out" });
      });
      return () => mm.revert();
    },
    { dependencies: [view], scope: root, revertOnUpdate: true },
  );
  return <div ref={root}>{children}</div>;
}

export type Slice = { key: string; label: string; value: number; color: string };

const TAU = Math.PI * 2;

function arcPath(a0: number, a1: number, r: number, inner: number) {
  const p = (a: number, rr: number) => `${100 + Math.cos(a) * rr},${100 + Math.sin(a) * rr}`;
  // Volta inteira (uma fatia só): o SVG não desenha arco que começa e termina no mesmo ponto, então
  // vira dois semicírculos por fora e dois por dentro (o miolo sai pelo evenodd)
  if (a1 - a0 >= TAU - 1e-6) {
    const ring = (rr: number) => `M${p(0, rr)} A${rr},${rr} 0 1 1 ${p(Math.PI, rr)} A${rr},${rr} 0 1 1 ${p(0, rr)} Z`;
    return `${ring(r)} ${ring(inner)}`;
  }
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(a0, r)} A${r},${r} 0 ${big} 1 ${p(a1, r)} L${p(a1, inner)} A${inner},${inner} 0 ${big} 0 ${p(a0, inner)} Z`;
}

/**
 * Rosca com o total no meio (centavos apagados, como no herói). Passar o mouse numa fatia mostra
 * o valor dela no centro e apaga as outras. Fatias abaixo de 3% viram "Outros".
 */
export function Donut({ slices, caption }: { slices: Slice[]; caption: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const big = slices.filter((s) => s.value / total >= 0.03);
  const rest = total - big.reduce((s, x) => s + x.value, 0);
  const parts = rest > 0 ? [...big, { key: "outros", label: "Outros", value: rest, color: "var(--series-ref)" }] : big;
  const focus = parts.find((p) => p.key === hover);
  const shown = focus ? focus.value : total;
  const [int, cents] = money(shown).split(",");

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-slice]", { scale: 0.6, autoAlpha: 0, svgOrigin: "100 100", stagger: 0.06, duration: 0.6, ease: "back.out(1.8)" });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [total] },
  );

  let a = -Math.PI / 2;
  const gap = parts.length > 1 ? 0.02 : 0;
  return (
    <div ref={root} className="grid justify-items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <svg viewBox="0 0 200 200" className="size-48 max-w-full" role="img" aria-label={`${caption}: ${money(total)}`}>
        {parts.map((p) => {
          const sweep = (p.value / total) * TAU;
          const d = arcPath(a + gap, a + sweep - gap, 88, 62);
          a += sweep;
          return (
            <path
              key={p.key}
              data-slice
              d={d}
              fill={p.color}
              fillRule="evenodd"
              opacity={hover && hover !== p.key ? 0.3 : 1}
              onMouseEnter={() => setHover(p.key)}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity duration-[var(--dur-base)]"
            />
          );
        })}
        <text x="100" y="92" textAnchor="middle" fontSize="11" fill="var(--muted)">
          {focus ? focus.label : caption}
        </text>
        <text x="100" y="118" textAnchor="middle" fontSize="22" fill="var(--foreground)" className="font-display tabular">
          {int}
          <tspan fontSize="13" fill="var(--muted)">,{cents}</tspan>
        </text>
      </svg>
      <ul className="grid w-full gap-1.5 text-sm">
        {parts.map((p) => (
          <li
            key={p.key}
            onMouseEnter={() => setHover(p.key)}
            onMouseLeave={() => setHover(null)}
            className={cx("flex items-center gap-2 rounded-chip px-1.5 py-1", hover === p.key && "bg-surface-2")}
          >
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="text-xs text-muted tabular">{Math.round((p.value / total) * 100)}%</span>
            <span className="w-24 text-right font-medium tabular">{money(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type RingItem = { key: string; label: string; value: number; goal: number | null; color: string; note: string };

/** Anéis de meta: cada cofrinho com meta vira um anel que enche até a porcentagem guardada. */
export function Rings({ items }: { items: RingItem[] }) {
  const root = useRef<HTMLDivElement>(null);
  const R = 36;
  const C = TAU * R;
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-ring-arc]", { attr: { "stroke-dashoffset": C }, stagger: 0.1, duration: 1.1, ease: "power3.out" });
      });
      return () => mm.revert();
    },
    { scope: root },
  );
  return (
    <div ref={root} className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {items.map((it) => {
        const pct = it.goal ? Math.min(1, it.value / it.goal) : null;
        return (
          <div key={it.key} className="grid justify-items-center gap-1 text-center">
            <svg viewBox="0 0 90 90" className="size-24" aria-hidden>
              <circle cx="45" cy="45" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
              {pct !== null && (
                <circle
                  data-ring-arc
                  cx="45"
                  cy="45"
                  r={R}
                  fill="none"
                  stroke={it.color}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - pct)}
                  transform="rotate(-90 45 45)"
                />
              )}
              <text x="45" y="51" textAnchor="middle" fontSize={pct === null ? 12 : 19} fill="var(--foreground)" className="font-display">
                {pct === null ? "sem meta" : Math.round(pct * 100)}
                {pct !== null && <tspan fontSize="10" fill="var(--muted)">%</tspan>}
              </text>
            </svg>
            <span className="max-w-full truncate text-sm font-semibold">{it.label}</span>
            <span className="text-xs text-muted tabular">{it.note}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Tabela simples: a alternativa acessível de todo gráfico (MASTER.md, "Gráficos"). */
export function DataTable({
  head,
  rows,
}: {
  head: string[];
  rows: { key: string; cells: ReactNode[]; strong?: boolean }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular">
        <thead className="text-left text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cx("py-1.5 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key} className={cx(r.strong && "font-semibold")}>
              {r.cells.map((c, i) => (
                <td key={i} className={cx("py-2", i > 0 && "text-right")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
