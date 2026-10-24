"use client";

import { useRef } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { money, moneyCompact, monthLabel } from "@/lib/format";
import { FULL, gsap, useGSAP } from "@/lib/motion";

// Cores dos gráficos: tokens de globals.css (tabela "Gráficos" em MASTER.md)
const INCOME = "var(--positive)";
const EXPENSE = "var(--negative)";
const GRID = "var(--grid)";
const AXIS_TICK = { fill: "var(--muted)", fontSize: 12 };
const DIMMED = 0.55;

export type Series = { key: string; label: string; color: string; dashed?: boolean };

type TooltipEntry = { dataKey?: string | number; value?: number | string | null };

/** Tooltip: valor em destaque, nome da série depois, marcado pela cor da série. */
function ChartTooltip({
  active,
  payload,
  title,
  series,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  title: string;
  series: Series[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid gap-1 rounded-control border border-border bg-surface px-3 py-2 text-xs">
      <p className="text-muted">{title}</p>
      {series.map((s) => {
        const entry = payload.find((p) => p.dataKey === s.key);
        if (entry?.value === null || entry?.value === undefined) return null;
        return (
          <p key={s.key} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            <strong className="text-sm font-semibold tabular">{money(entry.value)}</strong>
            <span className="text-muted">{s.label}</span>
          </p>
        );
      })}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          {s.dashed ? (
            <svg width="16" height="4" aria-hidden>
              <line x1="0" y1="2" x2="16" y2="2" stroke={s.color} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
          ) : (
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
          )}
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Barras crescem de baixo, em cascata, uma vez. O Recharts desenha depois de medir o
 * contêiner, então espera as barras aparecerem (até ~1s) antes de animar.
 */
function useBarsEntrance(deps: unknown[]) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        let tries = 0;
        const run = () => {
          const bars = root.current?.querySelectorAll(".recharts-bar-rectangle path");
          if (!bars?.length) {
            if (tries++ < 60) gsap.delayedCall(1 / 60, run);
            return;
          }
          gsap.from(bars, {
            scaleY: 0,
            transformOrigin: "50% 100%",
            duration: 0.5,
            ease: "power3.out",
            stagger: 0.025,
          });
        };
        run();
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: deps, revertOnUpdate: true },
  );
  return root;
}

// --- Fluxo de caixa: receitas x despesas por mês -------------------------------------

export const CASHFLOW_SERIES: Series[] = [
  { key: "income", label: "Receitas", color: INCOME },
  { key: "expense", label: "Despesas", color: EXPENSE },
];

export type CashflowPoint = { month: string; income: number; expense: number; net: number };

export function CashflowChart({ data, selected }: { data: CashflowPoint[]; selected: string }) {
  const root = useBarsEntrance([data]);
  return (
    <div ref={root} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ left: 4, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="month"
            tickFormatter={(m) => monthLabel(m, "short")}
            tick={({ x, y, payload }) => (
              <text
                x={x}
                y={Number(y) + 14}
                textAnchor="middle"
                fontSize={12}
                fill={payload.value === selected ? "var(--foreground)" : "var(--muted)"}
                fontWeight={payload.value === selected ? 700 : 400}
              >
                {monthLabel(payload.value, "short")}
              </text>
            )}
            axisLine={{ stroke: GRID }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={moneyCompact}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload as TooltipEntry[]}
                title={monthLabel(String(label))}
                series={CASHFLOW_SERIES}
              />
            )}
          />
          {CASHFLOW_SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              maxBarSize={22}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.month} fillOpacity={d.month === selected ? 1 : DIMMED} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Ritmo de gasto: acumulado do ciclo x ciclo anterior --------------------------------

export const DAILY_SERIES: Series[] = [
  { key: "current", label: "Este ciclo", color: "var(--accent)" },
  { key: "previous", label: "Ciclo anterior", color: "var(--series-ref)", dashed: true },
];

/** `day` = dia do ciclo (1, 2...); `label` = data desse dia no ciclo escolhido ("09/10") */
export type DailyPoint = {
  day: number;
  date: string;
  label?: string;
  current: number | null;
  previous: number | null;
};

/** Teto "redondo" (1, 2, 2,5 ou 5 × 10ⁿ) acima do maior valor, dividido em 4 faixas iguais. */
function niceMax(max: number) {
  if (max <= 0) return 100;
  const step = max / 4;
  const pow = 10 ** Math.floor(Math.log10(step));
  const nice = [1, 2, 2.5, 5, 10].find((m) => m * pow >= step)! * pow;
  return nice * 4;
}
const niceTicks = (max: number) => [0, 1, 2, 3, 4].map((i) => (niceMax(max) / 4) * i);

/**
 * Gasto acumulado por dia do ciclo: este ciclo em área (até hoje), o anterior em linha
 * tracejada no mesmo dia do ciclo, e uma marca em "hoje". O eixo X é o dia do ciclo, então os
 * dois ciclos se comparam ponto a ponto.
 */
export function DailyChart({ data, today }: { data: DailyPoint[]; today?: number }) {
  const max = Math.max(0, ...data.flatMap((d) => [d.current ?? 0, d.previous ?? 0]));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="day"
            tick={AXIS_TICK}
            axisLine={{ stroke: GRID }}
            tickLine={false}
            ticks={data.filter((d) => d.day === 1 || d.day % 5 === 0).map((d) => d.day)}
            tickFormatter={(day) => `dia ${day}`}
          />
          <YAxis
            domain={[0, niceMax(max)]}
            ticks={niceTicks(max)}
            tickFormatter={moneyCompact}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              const point = data.find((d) => d.day === label);
              return (
                <ChartTooltip
                  active={active}
                  payload={payload as TooltipEntry[]}
                  title={`Dia ${label} do ciclo${point?.label ? ` (${point.label})` : ""}`}
                  series={DAILY_SERIES}
                />
              );
            }}
          />
          {today !== undefined && (
            <ReferenceLine
              x={today}
              stroke="var(--muted)"
              strokeDasharray="2 3"
              label={{ value: "hoje", position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }}
            />
          )}
          <Line
            dataKey="previous"
            name="Ciclo anterior"
            stroke="var(--series-ref)"
            strokeWidth={1.75}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 3.5, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Area
            dataKey="current"
            name="Este ciclo"
            stroke="var(--accent)"
            strokeWidth={2.5}
            fill="var(--accent)"
            fillOpacity={0.12}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Compromissos futuros (parcelas): série única ------------------------------------

const COMMITMENT_SERIES: Series[] = [
  { key: "amount", label: "Parcelas e lançamentos", color: "var(--cat-move)" },
];

export function CommitmentsChart({ data }: { data: { month: string; amount: number }[] }) {
  const root = useBarsEntrance([data]);
  return (
    <div ref={root} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="month"
            tickFormatter={(m) => monthLabel(m, "short")}
            tick={AXIS_TICK}
            axisLine={{ stroke: GRID }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={moneyCompact}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload as TooltipEntry[]}
                title={monthLabel(String(label))}
                series={COMMITMENT_SERIES}
              />
            )}
          />
          <Bar
            dataKey="amount"
            fill={COMMITMENT_SERIES[0].color}
            maxBarSize={22}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

