"use client";

import { ChevronDown, ChevronUp, GripVertical, RotateCcw, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button, Card, CardTitle, IconButton, cx, tone } from "@/components/ui";

// Catálogo do painel da Visão geral. A escolha (ordem e o que está escondido) fica neste
// navegador: é preferência de quem usa, não dado financeiro.
export type CardId =
  | "hero"
  | "forecast"
  | "health"
  | "reserve"
  | "fixed"
  | "bills"
  | "cards"
  | "savings"
  | "installments"
  | "cashflow"
  | "categories"
  | "pace"
  | "commitments"
  | "merchants"
  | "recurring"
  | "needs"
  | "river"
  | "ruler"
  | "tiles";

type Span = "full" | "half" | "third";

export const CARDS: Record<CardId, { title: string; span: Span; color: string }> = {
  hero: { title: "Conta do ciclo", span: "full", color: "var(--accent)" },
  forecast: { title: "Previsão do ciclo", span: "full", color: "var(--accent)" },
  health: { title: "Saúde financeira", span: "third", color: "var(--cat-care)" },
  reserve: { title: "Reserva de emergência", span: "third", color: "var(--cat-home)" },
  fixed: { title: "Gastos fixos", span: "third", color: "var(--cat-move)" },
  bills: { title: "Faturas", span: "half", color: "var(--cat-move)" },
  cards: { title: "Cartões", span: "half", color: "var(--cat-move)" },
  savings: { title: "Cofrinhos", span: "half", color: "var(--cat-care)" },
  installments: { title: "Parcelas em andamento", span: "half", color: "var(--cat-move)" },
  cashflow: { title: "Receitas e despesas", span: "half", color: "var(--cat-home)" },
  categories: { title: "Para onde foi o dinheiro", span: "half", color: "var(--cat-food)" },
  pace: { title: "Ritmo de gastos", span: "half", color: "var(--cat-move)" },
  commitments: { title: "Compromissos futuros", span: "half", color: "var(--cat-care)" },
  merchants: { title: "Onde você mais gastou", span: "half", color: "var(--cat-shop)" },
  recurring: { title: "Assinaturas e gastos fixos", span: "half", color: "var(--cat-fun)" },
  needs: { title: "Precisava × vontade", span: "half", color: "var(--cat-shop)" },
  river: { title: "Rio do dinheiro", span: "full", color: "var(--accent)" },
  ruler: { title: "Régua do ciclo", span: "full", color: "var(--cat-move)" },
  tiles: { title: "Categorias em ladrilhos", span: "full", color: "var(--cat-food)" },
};

const DEFAULT_ORDER = Object.keys(CARDS) as CardId[];
// Extras (conceito "Fluxo", 2026-10-30): no catálogo, mas começam desligados
const EXTRAS: CardId[] = ["river", "ruler", "tiles"];
const STORAGE_KEY = "mf_painel_v1";

const SPAN_COLS: Record<Span, number> = { full: 6, half: 3, third: 2 };
// Classes completas (o Tailwind só gera o que aparece escrito no código)
const COL_CLASS: Record<number, string> = {
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
};

/**
 * Colunas de cada card na grade de 6. Quando o próximo card não cabe na linha (ou acabou a
 * lista), o último da linha estica até o fim dela: nada de buraco nem card sozinho pela metade.
 */
export function packRows(spans: Span[]): number[] {
  const cols = spans.map((s) => SPAN_COLS[s]);
  let used = 0;
  cols.forEach((c, i) => {
    if (used + c > 6) {
      cols[i - 1] += 6 - used;
      used = 0;
    }
    used += c;
  });
  if (cols.length && used < 6) cols[cols.length - 1] += 6 - used;
  return cols;
}

type Layout = { order: CardId[]; hidden: CardId[] };

function readLayout(): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Layout | null;
    if (saved && Array.isArray(saved.order)) {
      const order = saved.order.filter((id) => id in CARDS);
      // Cards que surgirem em versões novas entram logo depois do card que vem antes deles no
      // padrão (a Previsão aparece embaixo do topo, não no fim)
      DEFAULT_ORDER.forEach((id, i) => {
        if (order.includes(id)) return;
        const before = DEFAULT_ORDER.slice(0, i).reverse().find((prev) => order.includes(prev));
        order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
      });
      // Extra que este navegador ainda não conhecia chega desligado
      const fresh = EXTRAS.filter((id) => !saved.order.includes(id));
      return { order, hidden: [...(saved.hidden ?? []).filter((id) => id in CARDS), ...fresh] };
    }
  } catch {
    /* storage indisponível ou corrompido: volta ao padrão */
  }
  return { order: DEFAULT_ORDER, hidden: EXTRAS };
}

export function usePanelLayout() {
  const [layout, setLayout] = useState<Layout>({ order: DEFAULT_ORDER, hidden: EXTRAS });

  useEffect(() => setLayout(readLayout()), []);

  function save(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* sem storage: vale só nesta aba */
    }
  }

  return {
    ...layout,
    toggle: (id: CardId) =>
      save({
        ...layout,
        hidden: layout.hidden.includes(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id],
      }),
    move: (id: CardId, dir: -1 | 1) => {
      const visible = layout.order.filter((o) => !layout.hidden.includes(o));
      const target = visible[visible.indexOf(id) + dir];
      if (target) save({ ...layout, order: placeBefore(layout.order, id, target, dir) });
    },
    drop: (id: CardId, target: CardId) => {
      if (id === target) return;
      const dir = layout.order.indexOf(id) < layout.order.indexOf(target) ? 1 : -1;
      save({ ...layout, order: placeBefore(layout.order, id, target, dir) });
    },
    reset: () => save({ order: DEFAULT_ORDER, hidden: EXTRAS }),
  };
}

export type PanelLayout = ReturnType<typeof usePanelLayout>;

/** Tira `id` da lista e o põe antes (subindo) ou depois (descendo) de `target`. */
function placeBefore(order: CardId[], id: CardId, target: CardId, dir: -1 | 1) {
  const rest = order.filter((o) => o !== id);
  const at = rest.indexOf(target) + (dir === 1 ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Grade de 6 colunas: card inteiro, metade ou um terço. No celular, uma coluna. */
export function PanelGrid({
  layout,
  editing,
  cards,
}: {
  layout: PanelLayout;
  editing: boolean;
  cards: Record<CardId, ReactNode>;
}) {
  const [dragging, setDragging] = useState<CardId | null>(null);
  const visible = layout.order.filter((id) => !layout.hidden.includes(id));
  // Só os que vão aparecer entram na conta das linhas (card sem dados some fora da edição)
  const shown = visible.filter((id) => editing || cards[id]);
  const cols = packRows(shown.map((id) => CARDS[id].span));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
      {shown.map((id, index) => {
        const content = cards[id];
        return (
          <div
            key={id}
            className={cx(
              // grid: o card ocupa a altura da linha inteira, alinhado com os vizinhos
              "relative grid [&>*:first-child]:content-start",
              COL_CLASS[cols[index]],
              editing && "rounded-card outline-2 outline-offset-4 outline-border outline-dashed",
              dragging === id && "opacity-50",
            )}
            draggable={editing}
            onDragStart={(e) => {
              setDragging(id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => editing && dragging && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging) layout.drop(dragging, id);
              setDragging(null);
            }}
          >
            {content ?? (
              <Card className="grid min-h-32 place-items-center text-sm text-muted">
                {CARDS[id].title}: sem dados neste ciclo
              </Card>
            )}
            {editing && (
              <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-control bg-surface-2 p-0.5">
                <span className="grid size-9 cursor-grab place-items-center text-muted" title="Arraste para mover" aria-hidden>
                  <GripVertical className="size-4" />
                </span>
                <IconButton label={`Subir ${CARDS[id].title}`} disabled={index === 0} onClick={() => layout.move(id, -1)}>
                  <ChevronUp />
                </IconButton>
                <IconButton
                  label={`Descer ${CARDS[id].title}`}
                  disabled={index === shown.length - 1}
                  onClick={() => layout.move(id, 1)}
                >
                  <ChevronDown />
                </IconButton>
                <IconButton label={`Tirar ${CARDS[id].title} do painel`} onClick={() => layout.toggle(id)}>
                  <X />
                </IconButton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PanelCatalog({ layout, onDone }: { layout: PanelLayout; onDone: () => void }) {
  return (
    <Card className="grid gap-4">
      <CardTitle
        hint={
          <span className="flex gap-2">
            <Button variant="ghost" onClick={layout.reset}>
              <RotateCcw />
              Restaurar padrão
            </Button>
            <Button variant="primary" onClick={onDone}>
              Concluir
            </Button>
          </span>
        }
      >
        Monte o seu painel
      </CardTitle>
      <p className="-mt-2 text-sm text-muted">
        Ligue o que você quer ver. Arraste os cards ou use as setas para mudar a ordem. Fica salvo neste
        computador.
      </p>
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(CARDS) as CardId[]).map((id) => {
          const on = !layout.hidden.includes(id);
          return (
            <li key={id}>
              <label
                style={tone(CARDS[id].color)}
                className="flex min-h-11 items-center gap-3 rounded-control px-3 text-sm hover:bg-surface-2"
              >
                <span className="size-2.5 shrink-0 rounded-[3px] bg-[var(--c)]" aria-hidden />
                <span className="flex-1">{CARDS[id].title}</span>
                {EXTRAS.includes(id) && (
                  <span className="rounded-full bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] px-2 py-0.5 text-xs font-semibold text-accent">
                    Novo
                  </span>
                )}
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={on}
                  onChange={() => layout.toggle(id)}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
