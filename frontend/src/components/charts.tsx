"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { money, moneyCompact, monthLabel } from "@/lib/format";

// Cores vêm dos tokens de globals.css (slots validados para daltonismo, claro e escuro)
const SERIES_1 = "var(--series-1)";
const SERIES_2 = "var(--series-2)";
const SERIES_REF = "var(--series-ref)";
const GRID = "var(--grid)";
const AXIS_TICK = { fill: "var(--muted)", fontSize: 12 };

export type Series = { key: string; label: string; color: string };

type TooltipEntry = { dataKey?: string | number; value?: number | string | null };

/** Tooltip: valor em destaque, nome da série depois, marcado por um traço da cor. */
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
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 text-muted">{title}</p>
      {series.map((s) => {
        const entry = payload.find((p) => p.dataKey === s.key);
        if (entry?.value === null || entry?.value === undefined) return null;
        return (
          <p key={s.key} className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
            <strong className="text-sm font-medium tabular">{money(entry.value)}</strong>
            <span className="text-muted">{s.label}</span>
          </p>
        );
      })}
    </div>
  );
}

export function Legend({ series, shape }: { series: Series[]; shape: "rect" | "line" }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span
            className={shape === "rect" ? "h-2.5 w-2.5 rounded-sm" : "h-0.5 w-3.5 rounded"}
            style={{ background: s.color }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// --- Fluxo de caixa: receitas x despesas por mês -------------------------------------

export const CASHFLOW_SERIES: Series[] = [
  { key: "income", label: "Receitas", color: SERIES_1 },
  { key: "expense", label: "Despesas", color: SERIES_2 },
];

export type CashflowPoint = { month: string; income: number; expense: number; net: number };

export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ left: 4, right: 4 }}>
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
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Ritmo de gasto: acumulado do mês x mês anterior --------------------------------

export const DAILY_SERIES: Series[] = [
  { key: "current", label: "Este mês", color: SERIES_1 },
  { key: "previous", label: "Mês anterior", color: SERIES_REF },
];

export type DailyPoint = { day: number; current: number | null; previous: number | null };

export function DailyChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 4, right: 12, top: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="day"
            tick={AXIS_TICK}
            axisLine={{ stroke: GRID }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tickFormatter={moneyCompact}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                payload={payload as TooltipEntry[]}
                title={`Até o dia ${label}`}
                series={DAILY_SERIES}
              />
            )}
          />
          {DAILY_SERIES.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Compromissos futuros (parcelas): série única ------------------------------------

export function CommitmentsChart({ data }: { data: { month: string; amount: number }[] }) {
  const series: Series[] = [{ key: "amount", label: "Parcelas e lançamentos", color: SERIES_1 }];
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 4 }}>
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
                series={series}
              />
            )}
          />
          <Bar
            dataKey="amount"
            fill={SERIES_1}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
