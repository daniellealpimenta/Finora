"use client";

import { CalendarRange, Shapes, Waves, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CategoryIcon, categoryStyle } from "@/components/category-icon";
import { Pila } from "@/components/pila";
import { Card, CardTitle, IconButton, Pill } from "@/components/ui";
import { api, qs, type Category, type Transaction } from "@/lib/api";
import { money, moneyCompact, shortDate } from "@/lib/format";
import { Draggable, Flip, FULL, gsap, prefersReducedMotion, useGSAP } from "@/lib/motion";
import type { CategoryRow, Data, Forecast } from "./types";

/*
 * Cards extras do painel (MASTER.md, "Painel personalizável"), vindos do conceito "Fluxo":
 * começam desligados e entram pelo Personalizar.
 */

// --- Rio do dinheiro ---------------------------------------------------------------------

const RIVER_W = 900;
const RIVER_TOP = 18;
const RIVER_H = 300;
const MAX_STREAMS = 6;

type Stream = { label: string; value: number; color: string };

/** Entradas à esquerda, destinos à direita; partículas correm pelos caminhos. */
export function RiverCard({ data, keyById }: { data: Data; keyById: Map<number, Category> }) {
  const root = useRef<HTMLDivElement>(null);
  const [hot, setHot] = useState<number | null>(null);
  const f = data.summary.flow;

  const { sources, dests } = useMemo(() => {
    const cats = data.categories.filter((c) => c.spent > 0);
    const dests: Stream[] = cats.slice(0, MAX_STREAMS).map((c) => {
      const cat = c.category_id ? keyById.get(c.category_id) : undefined;
      return { label: c.category_name, value: c.spent, color: categoryStyle(cat?.key, cat?.kind ?? "EXPENSE").color };
    });
    const rest = cats.slice(MAX_STREAMS).reduce((s, c) => s + c.spent, 0);
    if (rest > 0) dests.push({ label: "Outras", value: rest, color: "var(--series-ref)" });
    if (f.saved > 0) dests.push({ label: "Guardado", value: f.saved, color: "var(--accent)" });
    const out = dests.reduce((s, d) => s + d.value, 0);
    if (f.income > out) dests.push({ label: "Sobrou", value: f.income - out, color: "var(--positive)" });
    const sources: Stream[] = [{ label: "Entrou", value: f.income, color: "var(--accent)" }];
    if (out > f.income) sources.push({ label: "Do saldo", value: out - f.income, color: "var(--series-ref)" });
    return { sources, dests };
  }, [data, keyById, f]);

  const total = Math.max(1, sources.reduce((s, x) => s + x.value, 0));
  const gap = 10;
  const k = (RIVER_H - gap * (dests.length - 1)) / total;
  const midX = 400;

  // Geometria: cada fluxo é um traço grosso (largura = valor) entre as colunas
  let sy = RIVER_TOP + 40;
  const left = sources.map((s) => {
    const h = s.value * k;
    const node = { ...s, y: sy, h };
    sy += h + 24;
    return node;
  });
  let my = RIVER_TOP;
  const inLinks = left.map((s) => {
    const y0 = s.y + s.h / 2;
    const y1 = my + s.h / 2;
    my += s.h;
    return { ...s, d: `M140 ${y0} C 270 ${y0}, 270 ${y1}, ${midX} ${y1}` };
  });
  let oy = RIVER_TOP;
  let mo = RIVER_TOP;
  const right = dests.map((s) => {
    const h = Math.max(2, s.value * k);
    const y0 = mo + h / 2;
    const y1 = oy + h / 2;
    const node = { ...s, y: oy, h, d: `M${midX + 14} ${y0} C 560 ${y0}, 560 ${y1}, 700 ${y1}` };
    mo += h;
    oy += h + gap;
    return node;
  });
  const height = Math.max(oy, sy) + RIVER_TOP;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        const q = gsap.utils.selector(root);
        gsap.from(q("[data-node]"), { scaleY: 0, transformOrigin: "50% 50%", stagger: 0.04, duration: 0.5, ease: "back.out(2)" });
        gsap.fromTo(q("[data-link]"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.1, stagger: 0.06, ease: "power2.inOut" });
        gsap.from(q("[data-label]"), { autoAlpha: 0, x: -8, stagger: 0.03, duration: 0.4, delay: 0.5 });
        // Partículas: mais dinheiro, mais partículas; correm sem parar enquanto o card está na tela
        const layer = root.current?.querySelector<SVGGElement>("[data-particles]");
        if (!layer) return;
        root.current!.querySelectorAll<SVGPathElement>("[data-link]").forEach((path) => {
          const n = Math.min(8, Math.max(1, Math.round(Number(path.getAttribute("data-value")) / (total / 18))));
          for (let i = 0; i < n; i++) {
            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            dot.setAttribute("r", String(gsap.utils.random(2, 3.4)));
            dot.setAttribute("fill", path.getAttribute("stroke") ?? "currentColor");
            layer.appendChild(dot);
            gsap.to(dot, {
              motionPath: { path, align: path, alignOrigin: [0.5, 0.5] },
              duration: gsap.utils.random(2.6, 4.2),
              repeat: -1,
              ease: "none",
              delay: -gsap.utils.random(0, 4),
            });
          }
        });
        return () => {
          layer.innerHTML = "";
        };
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [data.month], revertOnUpdate: true },
  );

  useGSAP(
    () => {
      gsap.to(gsap.utils.toArray("[data-out]", root.current), {
        strokeOpacity: (i) => (hot === null ? 0.3 : i === hot ? 0.65 : 0.06),
        duration: 0.3,
      });
    },
    { scope: root, dependencies: [hot] },
  );

  const focus = hot === null ? null : right[hot];
  return (
    <div ref={root} className="grid">
      <Card data-enter>
        <CardTitle icon={Waves} color="var(--accent)" hint="passe o mouse num destino">
          Rio do dinheiro
        </CardTitle>
        <p className="-mt-2 mb-3 min-h-6 text-sm text-muted" aria-live="polite">
          {focus
            ? `${focus.label}: ${money(focus.value)}, ${Math.round((focus.value / total) * 100)}% de tudo que correu no ciclo.`
            : `Entrou ${money(f.income)}. Cada partícula é um pedaço desse dinheiro indo para algum lugar.`}
        </p>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${RIVER_W} ${height}`}
            className="block w-full min-w-[620px]"
            role="img"
            aria-label="Fluxo do dinheiro: entradas à esquerda, destinos à direita"
          >
            {inLinks.map((l) => (
              <path key={l.label} data-link data-value={l.value} d={l.d} fill="none" stroke={l.color} strokeOpacity="0.3" strokeWidth={Math.max(2, l.h)} />
            ))}
            {right.map((r, i) => (
              <path
                key={r.label}
                data-link
                data-out
                data-value={r.value}
                d={r.d}
                fill="none"
                stroke={r.color}
                strokeOpacity="0.3"
                strokeWidth={r.h}
                className="cursor-pointer"
                onMouseEnter={() => setHot(i)}
                onMouseLeave={() => setHot(null)}
              />
            ))}
            {left.map((s) => (
              <g key={s.label}>
                <rect data-node x="128" y={s.y} width="12" height={Math.max(3, s.h)} rx="3" fill={s.color} />
                <text data-label x="118" y={s.y + s.h / 2} textAnchor="end" fontSize="14" fontWeight="600" fill="var(--foreground)">
                  {s.label}
                </text>
                <text data-label x="118" y={s.y + s.h / 2 + 16} textAnchor="end" fontSize="12" fill="var(--muted)">
                  {money(s.value)}
                </text>
              </g>
            ))}
            <rect data-node x={midX} y={RIVER_TOP} width="14" height={total * k} rx="4" fill="var(--foreground)" />
            {right.map((r, i) => (
              <g key={r.label} className="cursor-pointer" onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}>
                <rect data-node x="700" y={r.y} width="12" height={r.h} rx="3" fill={r.color} />
                <text data-label x="724" y={r.y + r.h / 2 + 5} fontSize="14" fontWeight="600" fill="var(--foreground)">
                  {r.label} <tspan fill="var(--muted)" fontWeight="500">{moneyCompact(r.value)}</tspan>
                </text>
              </g>
            ))}
            <g data-particles />
          </svg>
        </div>
      </Card>
    </div>
  );
}

// --- Régua do ciclo -----------------------------------------------------------------------

const RW = 640;
const RH = 260;
const PAD = { l: 48, r: 16, t: 18, b: 32 };

/** Saldo previsto dia a dia até o fechamento; arraste o marcador para ver o futuro. */
export function CycleRulerCard({ forecast }: { forecast: Forecast }) {
  const root = useRef<HTMLDivElement>(null);
  const handle = useRef<SVGGElement>(null);
  const [day, setDay] = useState(0);

  const { days, bal, events } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const days = Math.max(1, forecast.days_left);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const events: { day: number; label: string; amount: number }[] = [];
    const byDate = new Map<string, number>();
    forecast.fixed.forEach((x) => x.expected_date && byDate.set(x.expected_date, (byDate.get(x.expected_date) ?? 0) - x.amount));
    forecast.incomes
      .filter((i) => i.counted && !i.ignored && i.remaining > 0 && i.expected_date)
      .forEach((i) => byDate.set(i.expected_date!, (byDate.get(i.expected_date!) ?? 0) + i.remaining));
    const bal: number[] = [];
    let b = forecast.available_now;
    for (let d = 0; d <= days; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + d);
      if (d > 0) b -= forecast.daily_typical;
      const move = byDate.get(iso(date));
      if (move) {
        b += move;
        forecast.fixed
          .filter((x) => x.expected_date === iso(date))
          .forEach((x) => events.push({ day: d, label: x.name, amount: -x.amount }));
        forecast.incomes
          .filter((i) => i.expected_date === iso(date) && i.counted && !i.ignored && i.remaining > 0)
          .forEach((i) => events.push({ day: d, label: i.label, amount: i.remaining }));
      }
      bal.push(b);
    }
    return { days, bal, events };
  }, [forecast]);

  const lo = Math.min(0, ...bal);
  const hi = Math.max(...bal, 1) * 1.1;
  const xs = (d: number) => PAD.l + (d / days) * (RW - PAD.l - PAD.r);
  const ys = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (RH - PAD.t - PAD.b);
  const line = bal.map((v, d) => `${d ? "L" : "M"}${xs(d).toFixed(1)} ${ys(v).toFixed(1)}`).join("");
  const date = new Date();
  date.setDate(date.getDate() + day);
  const value = bal[day] ?? 0;
  const tight = value < forecast.daily_typical * 3;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + (hi - lo) * t);

  useGSAP(
    () => {
      const el = handle.current;
      if (!el) return;
      const toDay = (x: number) => Math.round(((x - PAD.l) / (RW - PAD.l - PAD.r)) * days);
      gsap.set(el, { x: xs(0) });
      const [drag] = Draggable.create(el, {
        type: "x",
        bounds: { minX: xs(0), maxX: xs(days) },
        inertia: true,
        snap: (v: number) => xs(gsap.utils.clamp(0, days, toDay(v))),
        onDrag() {
          setDay(gsap.utils.clamp(0, days, toDay(this.x)));
        },
        onThrowUpdate() {
          setDay(gsap.utils.clamp(0, days, toDay(this.x)));
        },
      });
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        // Chegando: a linha se desenha e o marcador passeia até o fim do ciclo e volta
        gsap
          .timeline()
          .fromTo("[data-line]", { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.2, ease: "power2.inOut" })
          .from("[data-ev]", { scale: 0, transformOrigin: "50% 50%", stagger: 0.07, duration: 0.4, ease: "back.out(3)" }, "-=0.5")
          .to(el, {
            x: xs(days),
            duration: 1.2,
            ease: "power2.inOut",
            yoyo: true,
            repeat: 1,
            onUpdate: () => setDay(gsap.utils.clamp(0, days, toDay(Number(gsap.getProperty(el, "x"))))),
            onComplete: () => drag.update(),
          });
      });
      return () => {
        drag.kill();
        mm.revert();
      };
    },
    { scope: root, dependencies: [days, bal] },
  );

  const step = (delta: number) => {
    const next = gsap.utils.clamp(0, days, day + delta);
    setDay(next);
    gsap.to(handle.current, {
      x: xs(next),
      duration: prefersReducedMotion() ? 0 : 0.25,
      ease: "power2.out",
      onComplete: () => handle.current && Draggable.get(handle.current)?.update(),
    });
  };

  return (
    <div ref={root} className="grid">
      <Card data-enter>
        <CardTitle icon={CalendarRange} color="var(--cat-move)" hint="arraste o marcador">
          Régua do ciclo
        </CardTitle>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <svg viewBox={`0 0 ${RW} ${RH}`} className="block w-full touch-pan-y" aria-hidden>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={RW - PAD.r} y1={ys(v)} y2={ys(v)} stroke="var(--grid)" />
                <text x={PAD.l - 8} y={ys(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                  {moneyCompact(v)}
                </text>
              </g>
            ))}
            {lo < 0 && <line x1={PAD.l} x2={RW - PAD.r} y1={ys(0)} y2={ys(0)} stroke="var(--negative)" strokeDasharray="4 4" />}
            <path d={`${line}L${xs(days)} ${ys(lo)}L${xs(0)} ${ys(lo)}z`} fill="var(--accent)" fillOpacity="0.12" />
            <path data-line d={line} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />
            {events.map((e, i) => (
              <circle
                key={i}
                data-ev
                cx={xs(e.day)}
                cy={ys(bal[e.day])}
                r="5.5"
                fill={e.amount > 0 ? "var(--positive)" : "var(--negative)"}
                stroke="var(--surface)"
                strokeWidth="2"
              />
            ))}
            <text x={xs(0)} y={RH - 8} fontSize="11" fill="var(--muted)">
              hoje
            </text>
            <text x={xs(days)} y={RH - 8} textAnchor="end" fontSize="11" fill="var(--muted)">
              fechamento
            </text>
            <g ref={handle} className="cursor-grab active:cursor-grabbing">
              <line x1="0" x2="0" y1={PAD.t} y2={RH - PAD.b} stroke="var(--foreground)" strokeWidth="1.5" />
              <circle cx="0" cy={ys(value)} r="9" fill="var(--surface)" stroke="var(--foreground)" strokeWidth="3" />
              <rect x="-20" y={RH - PAD.b - 6} width="40" height="20" rx="10" fill="var(--foreground)" />
              <path
                d={`M-11 ${RH - PAD.b}l-4 4l4 4M11 ${RH - PAD.b}l4 4l-4 4`}
                fill="none"
                stroke="var(--surface)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
          </svg>
          <div className="grid content-start gap-3">
            <div
              role="slider"
              tabIndex={0}
              aria-label="Dia do ciclo"
              aria-valuemin={0}
              aria-valuemax={days}
              aria-valuenow={day}
              aria-valuetext={`${date.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}: ${money(value)}`}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") step(1);
                if (e.key === "ArrowLeft") step(-1);
              }}
              className="grid gap-1 rounded-control"
            >
              <span className="label">
                {day === 0 ? "Hoje" : date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <span className="font-display text-[40px] leading-none tracking-[-0.02em] tabular">{money(value)}</span>
              <span className="text-xs text-muted">saldo previsto nesse dia, no seu ritmo</span>
            </div>
            <Pill status={value < 0 ? "bad" : tight ? "warn" : "ok"}>
              {value < 0 ? "No vermelho" : tight ? "Apertado" : "Tranquilo"}
            </Pill>
            <ul className="grid gap-1.5 text-sm">
              {events.slice(0, 6).map((e, i) => (
                <li key={i} className={`flex justify-between gap-2 border-t border-border pt-1.5 ${e.day <= day ? "text-muted line-through" : ""}`}>
                  <span className="truncate">{e.label}</span>
                  <span className="shrink-0 tabular">{e.amount > 0 ? "+" : "−"}{money(Math.abs(e.amount))}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

// --- Categorias que se abrem --------------------------------------------------------------

const TILES = 6;

/** Ladrilhos por categoria; tocar abre o ladrilho até virar o detalhe (Flip). */
export function CategoryTilesCard({ rows, keyById, month }: { rows: CategoryRow[]; keyById: Map<number, Category>; month: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<CategoryRow | null>(null);
  const [items, setItems] = useState<Transaction[] | null>(null);
  const flipState = useRef<{ state: Flip.FlipState; id: string } | null>(null);
  const tiles = rows.filter((r) => r.spent > 0).slice(0, TILES);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-tile]", { y: 30, autoAlpha: 0, stagger: 0.07, duration: 0.55, ease: "back.out(1.6)" });
        gsap.from("[data-tile-ico]", { rotation: -120, scale: 0.3, stagger: 0.07, duration: 0.6, ease: "back.out(2)" });
        gsap.from("[data-tile-bar]", { scaleX: 0, transformOrigin: "left", stagger: 0.07, duration: 0.8, ease: "power3.out", delay: 0.2 });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [month] },
  );

  const flipId = (r: CategoryRow) => `cat-${r.category_id ?? "none"}`;
  const capture = (r: CategoryRow) => {
    flipState.current = { state: Flip.getState(`[data-flip-id="${flipId(r)}"]`), id: flipId(r) };
  };

  const show = (r: CategoryRow) => {
    capture(r);
    setItems(null);
    setOpen(r);
    api<{ items: Transaction[] }>(`/transactions${qs({ month, category_id: r.category_id ?? undefined, page_size: 8 })}`)
      .then((p) => setItems(p.items))
      .catch(() => setItems([]));
  };
  const hide = () => {
    if (!open) return;
    capture(open);
    setOpen(null);
  };

  // Depois de cada troca, o Flip anima do retrato tirado antes para o lugar novo
  useLayoutEffect(() => {
    const snap = flipState.current;
    flipState.current = null;
    if (!snap || prefersReducedMotion()) return;
    // O ladrilho e o detalhe são elementos diferentes com o mesmo data-flip-id
    Flip.from(snap.state, {
      targets: `[data-flip-id="${snap.id}"]`,
      duration: 0.6,
      ease: "power3.inOut",
      scale: false,
      absolute: true,
      zIndex: 70,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useGSAP(
    () => {
      if (!items?.length || prefersReducedMotion()) return;
      gsap.from("[data-detail-row]", { y: 14, autoAlpha: 0, stagger: 0.05, duration: 0.4, ease: "power3.out" });
    },
    { dependencies: [items] },
  );

  const tile = (r: CategoryRow, expanded: boolean) => {
    const cat = r.category_id ? keyById.get(r.category_id) : undefined;
    const { color } = categoryStyle(cat?.key, cat?.kind ?? "EXPENSE");
    const share = r.budget ? r.spent / r.budget : null;
    return (
      <div
        data-flip-id={flipId(r)}
        className={
          expanded
            ? "relative grid max-h-[calc(100dvh-48px)] w-full max-w-xl gap-4 overflow-y-auto rounded-card border border-card-edge bg-surface p-6"
            : "grid h-full gap-3 rounded-card bg-surface-2 p-4 text-left"
        }
      >
        <div className="flex items-center gap-3">
          <span data-tile-ico={expanded ? undefined : true} className="inline-grid">
            <CategoryIcon categoryKey={cat?.key} kind={cat?.kind ?? "EXPENSE"} />
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">{r.category_name}</span>
          {expanded && (
            <IconButton label="Fechar" onClick={hide}>
              <X />
            </IconButton>
          )}
        </div>
        <p className={expanded ? "font-display text-[48px] leading-none tracking-[-0.02em] tabular" : "font-display text-[26px] leading-none tabular"}>
          {money(r.spent)}
        </p>
        <span className="h-1.5 overflow-hidden rounded-full bg-background">
          <span
            data-tile-bar={expanded ? undefined : true}
            className="block h-full rounded-full"
            style={{ width: `${Math.min(100, (share ?? r.spent / Math.max(r.spent, r.average || r.spent)) * 100)}%`, background: share && share > 1 ? "var(--negative)" : color }}
          />
        </span>
        <span className="text-xs text-muted">
          {r.budget ? `${Math.round((share ?? 0) * 100)}% do limite de ${money(r.budget)}` : r.average > 0 ? `média ${money(r.average)}` : "sem média ainda"}
        </span>
        {expanded && (
          <div className="grid">
            {items === null ? (
              <div className="grid place-items-center py-6">
                <Pila mood="neutral" size={64} />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted">Nada encontrado.</p>
            ) : (
              items.map((t) => (
                <div key={t.id} data-detail-row className="flex justify-between gap-3 border-t border-border py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    {t.merchant || t.description}
                    <span className="block text-xs text-muted">{shortDate(t.date)}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular">{money(Math.abs(Number(t.amount)))}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={root} className="grid">
      <Card data-enter>
        <CardTitle icon={Shapes} color="var(--cat-food)" hint="toque para abrir">
          Categorias em ladrilhos
        </CardTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {tiles.map((r) => (
            <button
              key={flipId(r)}
              data-tile
              type="button"
              onClick={() => show(r)}
              aria-label={`Abrir ${r.category_name}`}
              className="grid rounded-card text-left"
              style={{ visibility: open && flipId(open) === flipId(r) ? "hidden" : undefined }}
            >
              {open && flipId(open) === flipId(r) ? <div className="h-full" /> : tile(r, false)}
            </button>
          ))}
        </div>
      </Card>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center px-4 py-6" role="dialog" aria-modal="true" aria-label={open.category_name}>
            <div className="absolute inset-0 bg-black/45" onClick={hide} aria-hidden />
            {tile(open, true)}
          </div>,
          document.body,
        )}
    </div>
  );
}
