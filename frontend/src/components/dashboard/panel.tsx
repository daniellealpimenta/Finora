"use client";

import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Minus,
  Plus,
  RectangleVertical,
  RotateCcw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button, Card, CardTitle, IconButton, cx, tone } from "@/components/ui";
import { api } from "@/lib/api";
import { Flip, gsap, prefersReducedMotion } from "@/lib/motion";
import { playSound } from "@/lib/sound";
import { PanelViews } from "./views";

// Catálogo do painel da Visão geral. Como a pessoa montou (ordem, largura, altura, visualização,
// o que está escondido e quais cards novos já experimentou) fica salvo no app (GET/PUT /panel) e,
// como cópia rápida, no localStorage.
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
  | "tiles"
  | "recent";

/**
 * Três zonas (revisão de design de 2026-11-06, Gestalt: proximidade); o título da zona é o que
 * agrupa, sem caixa a mais. Cada card começa na zona dele, mas a pessoa leva qualquer card para
 * qualquer zona e para o lado de qualquer outro (2026-11-07).
 */
export type Zone = "agora" | "ciclo" | "depois";
export const ZONES: { id: Zone; title: string; hint: string }[] = [
  { id: "agora", title: "Agora", hint: "o que está na mão" },
  { id: "ciclo", title: "Este ciclo", hint: "como está indo" },
  { id: "depois", title: "Depois", hint: "o que já está combinado" },
];

export const CARDS: Record<CardId, { title: string; color: string; zone: Zone }> = {
  hero: { title: "Conta do ciclo", color: "var(--accent)", zone: "agora" },
  forecast: { title: "Previsão do ciclo", color: "var(--accent)", zone: "agora" },
  savings: { title: "Cofrinhos", color: "var(--cat-care)", zone: "ciclo" },
  cards: { title: "Cartões", color: "var(--cat-move)", zone: "ciclo" },
  reserve: { title: "Reserva de emergência", color: "var(--cat-home)", zone: "ciclo" },
  categories: { title: "Para onde foi o dinheiro", color: "var(--cat-food)", zone: "ciclo" },
  needs: { title: "Precisava × vontade", color: "var(--cat-shop)", zone: "depois" },
  health: { title: "Saúde financeira", color: "var(--cat-care)", zone: "ciclo" },
  pace: { title: "Ritmo de gastos", color: "var(--cat-move)", zone: "ciclo" },
  cashflow: { title: "Receitas e despesas", color: "var(--cat-home)", zone: "ciclo" },
  merchants: { title: "Onde você mais gastou", color: "var(--cat-shop)", zone: "ciclo" },
  river: { title: "Rio do dinheiro", color: "var(--accent)", zone: "ciclo" },
  ruler: { title: "Régua do ciclo", color: "var(--cat-move)", zone: "ciclo" },
  tiles: { title: "Categorias em ladrilhos", color: "var(--cat-food)", zone: "ciclo" },
  recent: { title: "Últimas transações", color: "var(--cat-home)", zone: "agora" },
  bills: { title: "Faturas", color: "var(--cat-move)", zone: "ciclo" },
  commitments: { title: "Compromissos futuros", color: "var(--cat-care)", zone: "depois" },
  installments: { title: "Parcelas em andamento", color: "var(--cat-move)", zone: "ciclo" },
  fixed: { title: "Gastos fixos", color: "var(--cat-move)", zone: "ciclo" },
  recurring: { title: "Assinaturas e gastos fixos", color: "var(--cat-fun)", zone: "depois" },
};

/**
 * O padrão (2026-11-07): a montagem que o Daniel salvou e escolheu como ideal.
 *
 *   Agora       Conta do ciclo e Previsão, na largura toda
 *   Este ciclo  Saúde e Reserva; Rio do dinheiro; Ritmo e Receitas e despesas; Ladrilhos;
 *               Faturas e Cartões; Para onde foi, Gastos fixos e Cofrinhos; Parcelas e Onde mais
 *               gastou; Régua do ciclo
 *   Depois      Assinaturas e Precisava × vontade
 *
 * Compromissos futuros fica no catálogo.
 */
const DEFAULT_ORDER: CardId[] = [
  "hero",
  "forecast",
  "health",
  "reserve",
  "river",
  "pace",
  "cashflow",
  "tiles",
  "bills",
  "cards",
  "categories",
  "fixed",
  "savings",
  "installments",
  "merchants",
  "ruler",
  "recurring",
  "needs",
  "commitments",
  "recent",
];
const DEFAULT_SIZES: Record<CardId, 2 | 3 | 4 | 6> = {
  hero: 6,
  forecast: 6,
  health: 2,
  reserve: 2,
  river: 6,
  pace: 3,
  cashflow: 3,
  tiles: 6,
  bills: 3,
  cards: 3,
  categories: 3,
  fixed: 2,
  savings: 2,
  installments: 3,
  merchants: 2,
  ruler: 6,
  recurring: 3,
  needs: 3,
  commitments: 4,
  recent: 3,
};
const DEFAULT_TALL: CardId[] = ["forecast"];
// Cards novos: mostram o selo "Novo" no catálogo até a pessoa ligar o card pela primeira vez
const EXTRAS: CardId[] = ["river", "ruler", "tiles", "recent"];
const DEFAULT_HIDDEN: CardId[] = ["commitments", "recent"];
// v2 (2026-11-06): painel em zonas e menos cards ligados; quem vinha da v1 recomeça do padrão novo
const STORAGE_KEY = "mf_painel_v2";

/** Largura na grade de 6 colunas: um terço, metade, dois terços ou inteiro. */
export type Size = 2 | 3 | 4 | 6;
const SIZES: Size[] = [2, 3, 4, 6];
const SIZE_LABEL: Record<Size, string> = { 2: "⅓", 3: "½", 4: "⅔", 6: "Inteiro" };
const SIZE_NAME: Record<Size, string> = { 2: "um terço", 3: "metade", 4: "dois terços", 6: "a largura toda" };
// Classes completas (o Tailwind só gera o que aparece escrito no código)
const COL_CLASS: Record<number, string> = {
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
};

/**
 * Colunas de cada card na grade de 6, simulando o posicionamento "dense" do CSS (cada card no
 * primeiro lugar livre, de cima para baixo; o de altura dupla ocupa duas linhas). Depois, o card de
 * largura padrão estica para a direita enquanto houver espaço vazio na linha dele: nada de buraco.
 * Largura escolhida pela pessoa (e card alto) não estica.
 */
export function packRows(sizes: Size[], fixed: boolean[], tall: boolean[]): number[] {
  const cols: number[] = [...sizes];
  const grid: (number | undefined)[][] = [];
  const at = (r: number, c: number) => grid[r]?.[c];
  const fill = (r: number, c: number, w: number, h: number, i: number) => {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) (grid[y] ??= [])[x] = i;
  };
  const fits = (r: number, c: number, w: number, h: number) => {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (at(y, x) !== undefined) return false;
    return true;
  };
  const pos: { r: number; c: number }[] = [];
  cols.forEach((w, i) => {
    const h = tall[i] ? 2 : 1;
    for (let r = 0; ; r++)
      for (let c = 0; c + w <= 6; c++)
        if (fits(r, c, w, h)) {
          fill(r, c, w, h, i);
          pos[i] = { r, c };
          return;
        }
  });
  cols.forEach((w, i) => {
    if (fixed[i] || tall[i]) return;
    const { r, c } = pos[i];
    let width = w;
    while (c + width < 6 && at(r, c + width) === undefined) width++;
    if (width !== w) {
      fill(r, c, width, 1, i);
      cols[i] = width;
    }
  });
  return cols;
}

export type Layout = {
  order: CardId[];
  hidden: CardId[];
  /** Largura escolhida; sem entrada = a padrão do card */
  sizes: Partial<Record<CardId, Size>>;
  /** Altura dupla: o card ocupa duas linhas e os vizinhos empilham ao lado (colunas) */
  tall: CardId[];
  /** Visualização escolhida em cada card (lista, rosca, tabela...) */
  views: Partial<Record<CardId, string>>;
  /** Cards novos que a pessoa já ligou: o selo "Novo" some */
  tried: CardId[];
  /** Zona escolhida para o card, quando ele saiu da zona de origem */
  zones: Partial<Record<CardId, Zone>>;
};

const DEFAULT_LAYOUT: Layout = {
  order: DEFAULT_ORDER,
  hidden: DEFAULT_HIDDEN,
  sizes: {},
  tall: DEFAULT_TALL,
  views: {},
  tried: [],
  zones: {},
};
const ZONE_IDS = ZONES.map((z) => z.id);

/** Assinatura da montagem (sem visualizações nem selos): diz se o painel está no padrão. */
const shape = (l: Layout) =>
  JSON.stringify([
    l.order,
    [...l.hidden].sort(),
    DEFAULT_ORDER.map((id) => l.sizes[id] ?? DEFAULT_SIZES[id]),
    [...l.tall].sort(),
    DEFAULT_ORDER.map((id) => l.zones[id] ?? CARDS[id].zone),
  ]);

const isCard = (id: unknown): id is CardId => typeof id === "string" && id in CARDS;

/** Aceita o que veio do app ou do localStorage e completa com o padrão o que faltar. */
function normalize(raw: unknown): Layout | null {
  if (!raw || typeof raw !== "object") return null;
  const saved = raw as Partial<Record<keyof Layout, unknown>>;
  if (!Array.isArray(saved.order)) return null;
  const known = saved.order.filter(isCard);
  const order = [...known];
  // Cards que surgirem em versões novas entram logo depois do card que vem antes deles no padrão
  DEFAULT_ORDER.forEach((id, i) => {
    if (order.includes(id)) return;
    const before = DEFAULT_ORDER.slice(0, i).reverse().find((prev) => order.includes(prev));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  // Card que esta configuração ainda não conhecia chega desligado
  const fresh = DEFAULT_ORDER.filter((id) => !known.includes(id));
  const hidden = [...(Array.isArray(saved.hidden) ? saved.hidden.filter(isCard) : []), ...fresh];
  const sizes: Layout["sizes"] = {};
  if (saved.sizes && typeof saved.sizes === "object")
    for (const [id, size] of Object.entries(saved.sizes))
      if (isCard(id) && SIZES.includes(size as Size)) sizes[id] = size as Size;
  const views: Layout["views"] = {};
  if (saved.views && typeof saved.views === "object")
    for (const [id, view] of Object.entries(saved.views)) if (isCard(id) && typeof view === "string") views[id] = view;
  const zones: Layout["zones"] = {};
  if (saved.zones && typeof saved.zones === "object")
    for (const [id, zone] of Object.entries(saved.zones))
      if (isCard(id) && ZONE_IDS.includes(zone as Zone)) zones[id] = zone as Zone;
  return {
    order,
    hidden: [...new Set(hidden)],
    sizes,
    tall: Array.isArray(saved.tall) ? saved.tall.filter(isCard) : [],
    views,
    tried: Array.isArray(saved.tried) ? saved.tried.filter(isCard) : [],
    zones,
  };
}

function readLocal(): Layout | null {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

function writeLocal(layout: Layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* sem storage: o app guarda do mesmo jeito */
  }
}

const putPanel = (layout: Layout) =>
  void api("/panel", { method: "PUT", body: JSON.stringify({ layout }) }).catch(() => undefined);

export function usePanelLayout() {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mudança ainda não enviada ao app (o envio espera 400ms) e se a pessoa já mexeu nesta visita
  const pending = useRef<Layout | null>(null);
  const edited = useRef(false);

  // Primeiro a cópia local (rápida); depois o que está salvo no app, que vale mais
  useEffect(() => {
    const local = readLocal();
    if (local) setLayout(local);
    api<{ layout: unknown }>("/panel")
      .then(({ layout: remote }) => {
        // Se a pessoa já mexeu antes da resposta chegar, o que está na tela vale mais
        if (edited.current) return;
        const saved = normalize(remote);
        if (saved) {
          setLayout(saved);
          writeLocal(saved);
        } else if (local) {
          // Quem montou o painel antes de ele ir para o app: leva a montagem junto
          putPanel(local);
        }
      })
      .catch(() => undefined);
    return () => {
      // Saindo da página com envio pendente: envia já, em vez de perder a mudança
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) putPanel(pending.current);
    };
  }, []);

  const save = useCallback((update: (prev: Layout) => Layout) => {
    edited.current = true;
    setLayout((prev) => {
      const next = update(prev);
      if (next === prev) return prev;
      writeLocal(next);
      // Junta mudanças seguidas (arrastar, clicar várias vezes no +) num envio só
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        pending.current = null;
        putPanel(next);
      }, 400);
      return next;
    });
  }, []);

  const sizeOf = (id: CardId): Size => layout.sizes[id] ?? DEFAULT_SIZES[id];
  const zoneOf = (id: CardId, l: Layout = layout): Zone => l.zones[id] ?? CARDS[id].zone;
  /** Cards ligados na ordem em que aparecem na tela: zona por zona. */
  const sequence = (l: Layout) =>
    ZONE_IDS.flatMap((z) => l.order.filter((o) => !l.hidden.includes(o) && zoneOf(o, l) === z));

  return {
    ...layout,
    sizeOf,
    zoneOf,
    isDefault: shape(layout) === shape(DEFAULT_LAYOUT),
    /** Primeiro e último na tela (as setas param neles) */
    isEdge: (id: CardId, dir: -1 | 1) => {
      const seq = sequence(layout);
      return seq.indexOf(id) === (dir === -1 ? 0 : seq.length - 1);
    },
    // Novo = ainda não experimentado: nunca foi ligado e não está ligado agora
    isNew: (id: CardId) => EXTRAS.includes(id) && !layout.tried.includes(id) && layout.hidden.includes(id),
    toggle: (id: CardId) =>
      save((l) => {
        const showing = l.hidden.includes(id);
        return {
          ...l,
          hidden: showing ? l.hidden.filter((h) => h !== id) : [...l.hidden, id],
          tried: showing && !l.tried.includes(id) ? [...l.tried, id] : l.tried,
        };
      }),
    // As setas atravessam zonas: do último card de uma zona, o próximo passo é a zona seguinte
    move: (id: CardId, dir: -1 | 1) =>
      save((l) => {
        const seq = sequence(l);
        const target = seq[seq.indexOf(id) + dir];
        if (!target) return l;
        // Mudando de zona, o card entra na borda da zona nova (primeiro ou último dela), não depois do vizinho
        const side = zoneOf(target, l) === zoneOf(id, l) ? dir : dir === 1 ? -1 : 1;
        return { ...l, zones: { ...l.zones, [id]: zoneOf(target, l) }, order: placeBefore(l.order, id, target, side) };
      }),
    /** Solto sobre outro card: entra no lugar dele, na zona dele */
    drop: (id: CardId, target: CardId) =>
      save((l) => {
        if (id === target) return l;
        const dir = l.order.indexOf(id) < l.order.indexOf(target) ? 1 : -1;
        return { ...l, zones: { ...l.zones, [id]: zoneOf(target, l) }, order: placeBefore(l.order, id, target, dir) };
      }),
    /** Solto no fim de uma zona (inclusive vazia): vai para o fim dela */
    dropInZone: (id: CardId, zone: Zone) =>
      save((l) => {
        const last = [...sequence(l)].reverse().find((o) => o !== id && zoneOf(o, l) === zone);
        const order = last ? placeBefore(l.order, id, last, 1) : [...l.order.filter((o) => o !== id), id];
        return { ...l, zones: { ...l.zones, [id]: zone }, order };
      }),
    resize: (id: CardId, step: -1 | 1) =>
      save((l) => {
        const current = l.sizes[id] ?? DEFAULT_SIZES[id];
        const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(current) + step))];
        // De volta à largura padrão: some a escolha e o card volta a esticar para fechar buracos
        const { [id]: _drop, ...rest } = l.sizes;
        void _drop;
        return { ...l, sizes: next === DEFAULT_SIZES[id] ? rest : { ...l.sizes, [id]: next } };
      }),
    toggleTall: (id: CardId) =>
      save((l) => ({ ...l, tall: l.tall.includes(id) ? l.tall.filter((t) => t !== id) : [...l.tall, id] })),
    setView: (id: CardId, view: string) => save((l) => ({ ...l, views: { ...l.views, [id]: view } })),
    // Voltar ao padrão mexe na montagem; visualizações escolhidas e selos já vistos ficam
    reset: () => save((l) => ({ ...DEFAULT_LAYOUT, tried: l.tried, views: l.views })),
  };
}

export type PanelLayout = ReturnType<typeof usePanelLayout>;

/** Tira `id` da lista e o põe antes (subindo) ou depois (descendo) de `target`. */
function placeBefore(order: CardId[], id: CardId, target: CardId, dir: -1 | 1) {
  const rest = order.filter((o) => o !== id);
  const at = rest.indexOf(target) + (dir === 1 ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * As três zonas, uma embaixo da outra, cada uma com a sua grade de 6 colunas. Zona sem card ligado
 * não aparece. Reorganizar (tamanho, altura, ordem) anima com Flip: cada card desliza até o novo
 * lugar em vez de pular.
 */
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
  const root = useRef<HTMLDivElement>(null);
  const flip = useRef<Flip.FlipState | null>(null);
  const visible = layout.order.filter((id) => !layout.hidden.includes(id));
  // Só os que vão aparecer entram na conta das linhas (card sem dados some fora da edição)
  const shown = visible.filter((id) => editing || cards[id]);

  /** Guarda onde cada card está antes da mudança, para animar até onde ele vai. */
  const animate = useCallback((change: () => void) => {
    if (root.current && !prefersReducedMotion()) flip.current = Flip.getState(root.current.querySelectorAll("[data-flip-id]"));
    playSound("tap");
    change();
    // Mudança que não mudou nada (seta na borda, soltar no mesmo lugar) não pode deixar foto velha
    requestAnimationFrame(() => (flip.current = null));
  }, []);

  // Sem lista de dependências: roda a cada desenho, mas só anima quando há uma foto pendente
  useLayoutEffect(() => {
    if (!flip.current || !root.current) return;
    Flip.from(flip.current, {
      targets: root.current.querySelectorAll("[data-flip-id]"),
      duration: 0.5,
      ease: "power3.inOut",
      // Card que acabou de ser ligado aparece crescendo no lugar dele
      onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, scale: 0.94 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power3.out" }),
    });
    flip.current = null;
  });

  // Contexto estável: só muda quando as visualizações mudam (senão todo card redesenha à toa)
  const setViewRef = useRef(layout.setView);
  setViewRef.current = layout.setView;
  const views = useMemo(
    () => ({
      views: layout.views as Record<string, string>,
      setView: (id: string, v: string) => isCard(id) && setViewRef.current(id, v),
    }),
    [layout.views],
  );

  return (
    <PanelViews.Provider value={views}>
      <div ref={root} className="grid gap-8">
        {editing && (
          <p className="rounded-card border border-dashed border-border px-4 py-3 text-sm text-muted">
            <b className="text-foreground">Montando o painel.</b> Arraste pelo{" "}
            <GripVertical className="inline size-4 align-[-3px]" aria-hidden /> para levar o card para qualquer lugar,
            inclusive para outra zona.{" "}
            <Minus className="inline size-4 align-[-3px]" aria-hidden /> e{" "}
            <Plus className="inline size-4 align-[-3px]" aria-hidden /> mudam a largura, e{" "}
            <RectangleVertical className="inline size-4 align-[-3px]" aria-hidden /> deixa o card com altura dupla,
            para os vizinhos empilharem ao lado em coluna. Tudo fica salvo.
          </p>
        )}
        {ZONES.map((zone) => {
          const ids = shown.filter((id) => layout.zoneOf(id) === zone.id);
          // Montando, toda zona aparece (dá para soltar card numa zona vazia)
          if (!ids.length && !editing) return null;
          return (
            <section
              key={zone.id}
              aria-labelledby={`zona-${zone.id}`}
              className="grid gap-3"
              onDragOver={(e) => editing && dragging && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragging;
                setDragging(null);
                if (from) animate(() => layout.dropInZone(from, zone.id));
              }}
            >
              <h2 id={`zona-${zone.id}`} data-enter className="flex items-baseline gap-2">
                <span className="font-display text-xl font-bold tracking-[-0.01em]">{zone.title}</span>
                <span className="text-sm text-muted">{zone.hint}</span>
              </h2>
              {editing && ids.length === 0 && (
                <p className="grid min-h-24 place-items-center rounded-card border-2 border-dashed border-border text-sm text-muted">
                  Solte um card aqui
                </p>
              )}
              <ZoneGrid
                ids={ids}
                cards={cards}
                layout={layout}
                editing={editing}
                dragging={dragging}
                setDragging={setDragging}
                animate={animate}
              />
            </section>
          );
        })}
      </div>
    </PanelViews.Provider>
  );
}

function ZoneGrid({
  ids: shown,
  cards,
  layout,
  editing,
  dragging,
  setDragging,
  animate,
}: {
  ids: CardId[];
  cards: Record<CardId, ReactNode>;
  layout: PanelLayout;
  editing: boolean;
  dragging: CardId | null;
  setDragging: (id: CardId | null) => void;
  animate: (change: () => void) => void;
}) {
  const [over, setOver] = useState<CardId | null>(null);
  const cols = packRows(
    shown.map((id) => layout.sizeOf(id)),
    shown.map((id) => id in layout.sizes),
    shown.map((id) => layout.tall.includes(id)),
  );

  return (
    // dense: um card de altura dupla deixa espaço ao lado, e os menores sobem para preencher
    <div className="grid grid-cols-1 gap-4 md:grid-flow-row-dense md:grid-cols-6">
      {shown.map((id, index) => {
        const content = cards[id];
        const size = layout.sizeOf(id);
        const tall = layout.tall.includes(id);
        const title = CARDS[id].title;
        return (
          <div
            key={id}
            data-flip-id={id}
            className={cx(
              // grid: o card ocupa a altura da linha inteira, alinhado com os vizinhos
              "relative grid [&>*:first-child]:content-start",
              COL_CLASS[cols[index]],
              tall && "md:row-span-2",
              editing && "rounded-card outline-2 outline-offset-4 outline-border outline-dashed",
              editing && "[&>*:first-child]:pointer-events-none [&>*:first-child]:select-none",
              over === id && dragging !== id && "outline-accent",
              dragging === id && "opacity-40",
            )}
            draggable={editing}
            onDragStart={(e) => {
              setDragging(id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDragOver={(e) => {
              if (!editing || !dragging) return;
              e.preventDefault();
              e.stopPropagation();
              setOver(id);
            }}
            onDragLeave={() => setOver((o) => (o === id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const from = dragging;
              setDragging(null);
              setOver(null);
              if (from) animate(() => layout.drop(from, id));
            }}
          >
            {content ?? (
              <Card className="grid min-h-32 place-items-center text-sm text-muted">{title}: sem dados neste ciclo</Card>
            )}
            {editing && (
              <div className="absolute top-2 right-2 z-10 flex flex-wrap items-center justify-end gap-0.5 rounded-control border border-card-edge bg-surface p-0.5">
                <span className="grid size-9 cursor-grab place-items-center text-muted active:cursor-grabbing" title="Arraste para mover" aria-hidden>
                  <GripVertical className="size-4" />
                </span>
                <IconButton
                  label={`Diminuir ${title}`}
                  disabled={size === SIZES[0]}
                  onClick={() => animate(() => layout.resize(id, -1))}
                  className="sm:size-9"
                >
                  <Minus />
                </IconButton>
                <span className="min-w-12 text-center text-xs font-semibold tabular" aria-live="polite" aria-label={`Largura: ${SIZE_NAME[size]}`}>
                  {SIZE_LABEL[size]}
                </span>
                <IconButton
                  label={`Aumentar ${title}`}
                  disabled={size === SIZES[SIZES.length - 1]}
                  onClick={() => animate(() => layout.resize(id, 1))}
                  className="sm:size-9"
                >
                  <Plus />
                </IconButton>
                <IconButton
                  label={tall ? `Altura normal para ${title}` : `Altura dupla para ${title}`}
                  aria-pressed={tall}
                  onClick={() => animate(() => layout.toggleTall(id))}
                  className={cx("sm:size-9", tall && "bg-surface-2 text-accent")}
                >
                  <RectangleVertical />
                </IconButton>
                <IconButton label={`Mover ${title} para antes`} disabled={layout.isEdge(id, -1)} onClick={() => animate(() => layout.move(id, -1))} className="sm:size-9">
                  <ChevronLeft />
                </IconButton>
                <IconButton
                  label={`Mover ${title} para depois`}
                  disabled={layout.isEdge(id, 1)}
                  onClick={() => animate(() => layout.move(id, 1))}
                  className="sm:size-9"
                >
                  <ChevronRight />
                </IconButton>
                <IconButton label={`Tirar ${title} do painel`} onClick={() => animate(() => layout.toggle(id))} className="sm:size-9">
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
            <Button variant="ghost" onClick={layout.reset} disabled={layout.isDefault}>
              <RotateCcw />
              Voltar ao padrão
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
        Ligue o que você quer ver. Nos cards ligados, arraste para qualquer lugar (inclusive para outra zona) e
        mude a largura e a altura. Fica salvo no app.
      </p>
      {ZONES.map((zone) => (
        <div key={zone.id} className="grid gap-1">
          <p className="label">{zone.title}</p>
          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {DEFAULT_ORDER.filter((id) => layout.zoneOf(id) === zone.id).map((id) => {
              const on = !layout.hidden.includes(id);
              return (
                <li key={id}>
                  <label
                    style={tone(CARDS[id].color)}
                    className="flex min-h-11 items-center gap-3 rounded-control px-3 text-sm hover:bg-surface-2"
                  >
                    <span className="size-2.5 shrink-0 rounded-[3px] bg-[var(--c)]" aria-hidden />
                    <span className="flex-1">{CARDS[id].title}</span>
                    {layout.isNew(id) && (
                      <span className="rounded-full bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] px-2 py-0.5 text-xs font-semibold text-accent">
                        Novo
                      </span>
                    )}
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={on}
                      onChange={() => {
                        playSound("tap");
                        layout.toggle(id);
                      }}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Card>
  );
}
