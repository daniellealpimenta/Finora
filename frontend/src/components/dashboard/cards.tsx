"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChartColumn,
  CreditCard,
  Gauge,
  Heart,
  PiggyBank,
  Repeat,
  Shield,
  Store,
  Table,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { CategoryIcon, categoryStyle } from "@/components/category-icon";
import {
  CASHFLOW_SERIES,
  CashflowChart,
  CommitmentsChart,
  DAILY_SERIES,
  DailyChart,
  Legend,
  type CashflowPoint,
} from "@/components/charts";
import { PilaSays, type PilaMood } from "@/components/pila";
import {
  Button,
  Card,
  CardTitle,
  Empty,
  IconBadge,
  Meter,
  Pill,
  STATUS_COLOR,
  cx,
  tone,
  type Status,
} from "@/components/ui";
import type { Category, Installment, SavingsPot } from "@/lib/api";
import { money, monthLabel, percent, shiftMonth, shortDate } from "@/lib/format";
import { wiggle } from "@/lib/motion";
import type { CategoryRow, Data, Summary } from "./types";

// Limites iguais aos do score do backend (app/services/analytics.py::_health_score)
const RESERVE_GOAL_MONTHS = 6;
const FIXED_IDEAL = 0.3;
const RING_RADIUS = 27;
export const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const healthStatus = (score: number): Status => (score >= 70 ? "ok" : score >= 40 ? "warn" : "bad");
const pointsStatus = (points: number, max: number): Status =>
  points / max >= 2 / 3 ? "ok" : points / max >= 1 / 3 ? "warn" : "bad";
const STATUS_LABEL: Record<Status, string> = { ok: "Boa", warn: "Atenção", bad: "Crítica" };

export const monthName = (m: string) => monthLabel(m).split(" de ")[0].toLowerCase();
export const intPart = (v: number) =>
  Math.floor(Math.abs(v)).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
export const centsPart = (v: number) =>
  "," + String(Math.round((Math.abs(v) % 1) * 100) % 100).padStart(2, "0");

/** Frase-resumo em linguagem natural, só com números da API. */
export function Story({ data, keyById }: { data: Data; keyById: Map<number, Category> }) {
  const s = data.summary;
  const prev = monthName(shiftMonth(data.month, -1));
  const parts: ReactNode[] = [];

  if (s.expense > 0 && s.previous_expense > 0) {
    const change = (s.expense - s.previous_expense) / s.previous_expense;
    if (Math.abs(change) < 0.01) {
      parts.push(<>Você gastou praticamente o mesmo que em {prev}</>);
    } else {
      const less = change < 0;
      parts.push(
        <>
          Você gastou{" "}
          <Mark color={less ? "var(--positive)" : "var(--negative)"}>
            {percent(Math.abs(change))} {less ? "menos" : "mais"}
          </Mark>{" "}
          que em {prev}
        </>,
      );
      // Quando gastou mais, aponta a categoria que mais fugiu da média
      const culprit = data.categories
        .filter((r) => r.anomaly && (r.change ?? 0) > 0)
        .sort((a, b) => b.spent - a.spent)[0];
      if (!less && culprit) {
        const cat = culprit.category_id ? keyById.get(culprit.category_id) : undefined;
        parts.push(
          <>
            , puxado por{" "}
            <Mark color={categoryStyle(cat?.key, cat?.kind).color}>{culprit.category_name}</Mark>
          </>,
        );
      }
    }
  } else if (s.expense > 0) {
    parts.push(<>Você gastou {money(s.expense)} em {monthName(data.month)}</>);
  } else {
    parts.push(<>Nenhuma despesa registrada em {monthName(data.month)}</>);
  }

  if (s.savings_rate !== null && s.savings_rate >= 0) {
    parts.push(
      <>
        {" "}e guardou <strong className="font-semibold">{percent(s.savings_rate)}</strong> do que entrou.
      </>,
    );
  } else if (s.savings_rate !== null) {
    parts.push(
      <>
        {" "}e gastou <Mark color="var(--negative)">{money(-s.net)} a mais</Mark> do que entrou.
      </>,
    );
  } else {
    parts.push(<>.</>);
  }

  if (s.projected_expense !== null) {
    parts.push(
      <>
        {" "}No ritmo atual, as despesas do mês devem chegar a{" "}
        <strong className="font-semibold">{money(s.projected_expense)}</strong>.
      </>,
    );
  }

  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </>
  );
}

export function Mark({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={tone(color)} className="tint rounded-[5px] px-1.5 font-semibold whitespace-nowrap">
      {children}
    </span>
  );
}

export function delta(current: number, previous: number, month: string, lowerIsBetter: boolean) {
  const prev = monthName(shiftMonth(month, -1));
  if (!previous) return <span className="text-muted">sem dados de {prev}</span>;
  const change = (current - previous) / previous;
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "=";
  const good = lowerIsBetter ? change <= 0 : change >= 0;
  return (
    <span className={cx("font-semibold", good ? "text-positive" : "text-negative")}>
      {arrow} {percent(Math.abs(change))} vs {prev}
    </span>
  );
}

export function HeroRow({
  icon,
  color,
  label,
  value,
  note,
}: {
  icon: typeof Wallet;
  color: string;
  label: string;
  value: string;
  note: ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex items-center gap-2.5">
        <IconBadge icon={icon} color={color} size="sm" />
        <span className="text-sm text-muted">{label}</span>
      </span>
      <span className="grid justify-items-end">
        <span className="text-[17px] font-medium tabular">{value}</span>
        <span className="text-xs">{note}</span>
      </span>
    </li>
  );
}

function IndexHeader({
  icon,
  color,
  title,
  status,
  shine,
}: {
  icon: typeof Heart;
  color: string;
  title: string;
  status: Status | null;
  shine?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2.5">
        <IconBadge icon={icon} color={color} size="sm" />
        <span className="label uppercase">{title}</span>
      </span>
      {status && (
        <Pill status={status} data-pop>
          {STATUS_LABEL[status]}
          {shine && (
            <span
              data-shine
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-2/5 -translate-x-[120%] bg-[linear-gradient(100deg,transparent,color-mix(in_oklab,var(--surface)_70%,transparent),transparent)]"
            />
          )}
        </Pill>
      )}
    </div>
  );
}

export function HealthCard({ health }: { health: Summary["health"] }) {
  const status = healthStatus(health.score);
  const parts = [
    { label: "Poupança", points: health.savings_points, max: 40 },
    { label: "Reserva", points: health.reserve_points, max: 30 },
    { label: "Gastos fixos", points: health.commitment_points, max: 30 },
  ];
  return (
    <Card data-enter className="grid content-start gap-4">
      <IndexHeader icon={Heart} color="var(--cat-care)" title="Saúde financeira" status={status} shine />
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 64 64" className="size-16 shrink-0" aria-hidden>
          <circle cx="32" cy="32" r={RING_RADIUS} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
          <circle
            data-ring
            cx="32"
            cy="32"
            r={RING_RADIUS}
            fill="none"
            stroke={STATUS_COLOR[status]}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - Math.min(Math.max(health.score, 0), 100) / 100)}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <p className="text-[28px] leading-tight font-light tracking-[-0.02em] tabular">
          <span data-score>{health.score}</span>
          <span className="text-sm font-medium tracking-normal text-muted"> /100</span>
        </p>
      </div>
      <ul className="grid gap-2.5" aria-label="Composição do score">
        {parts.map((p) => (
          <li key={p.label} className="grid gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted">{p.label}</span>
              <span className="font-semibold tabular">
                {p.points.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de {p.max}
              </span>
            </div>
            <Meter thin value={p.points / p.max} color={STATUS_COLOR[pointsStatus(p.points, p.max)]} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ReserveCard({ months, avg }: { months: number | null; avg: number }) {
  const status: Status | null =
    months === null ? null : months >= RESERVE_GOAL_MONTHS ? "ok" : months >= 3 ? "warn" : "bad";
  return (
    <Card data-enter className="grid content-start gap-4">
      <IndexHeader icon={Shield} color="var(--cat-home)" title="Reserva de emergência" status={status} />
      <p className="text-[28px] leading-tight font-light tracking-[-0.02em] tabular">
        {months === null ? (
          <span className="text-xl text-muted">sem dados</span>
        ) : (
          <>
            {months.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            <span className="text-sm font-medium tracking-normal text-muted"> meses</span>
          </>
        )}
      </p>
      <div className="grid gap-1.5">
        <Meter
          value={(months ?? 0) / RESERVE_GOAL_MONTHS}
          color={status ? STATUS_COLOR[status] : "var(--muted)"}
          label={`${months ?? 0} de ${RESERVE_GOAL_MONTHS} meses`}
        />
        <div className="flex justify-between text-[11px] text-muted tabular">
          <span>0</span>
          <span>meta: {RESERVE_GOAL_MONTHS} meses</span>
        </div>
      </div>
      <p className="text-[13px] leading-normal text-muted">
        Quanto tempo o saldo em conta cobre o seu gasto médio ({money(avg)}/mês) se a renda parar.
      </p>
    </Card>
  );
}

export function FixedCard({ commitment, monthly }: { commitment: number | null; monthly: number }) {
  const status: Status | null =
    commitment === null ? null : commitment <= FIXED_IDEAL ? "ok" : commitment <= 0.5 ? "warn" : "bad";
  return (
    <Card data-enter className="grid content-start gap-4">
      <IndexHeader icon={Repeat} color="var(--cat-move)" title="Gastos fixos" status={status} />
      <p className="text-[28px] leading-tight font-light tracking-[-0.02em] tabular">
        {commitment === null ? money(monthly) : percent(commitment)}
        <span className="text-sm font-medium tracking-normal text-muted">
          {commitment === null ? " /mês" : " da renda"}
        </span>
      </p>
      <div className="grid gap-1.5">
        <Meter
          value={commitment ?? 0}
          marker={FIXED_IDEAL}
          color={status ? STATUS_COLOR[status] : "var(--muted)"}
          label={commitment === null ? undefined : `${percent(commitment)} da renda`}
        />
        <div className="flex justify-between text-[11px] text-muted tabular">
          <span>0%</span>
          <span>ideal: até {percent(FIXED_IDEAL)}</span>
        </div>
      </div>
      <p className="text-[13px] leading-normal text-muted">
        Assinaturas e contas recorrentes somam {money(monthly)} por mês.
        {commitment === null && " Sem receita no período para comparar."}
      </p>
    </Card>
  );
}

export function CashflowCard({ data, selected }: { data: CashflowPoint[]; selected: string }) {
  const [table, setTable] = useState(false);
  return (
    <Card data-enter>
      <CardTitle
        icon={ChartColumn}
        color="var(--cat-home)"
        hint={
          <Button variant="ghost" className="min-h-8 px-2.5 text-xs" onClick={() => setTable(!table)}>
            {table ? <ChartColumn /> : <Table />}
            {table ? "Ver gráfico" : "Ver tabela"}
          </Button>
        }
      >
        Receitas e despesas
      </CardTitle>
      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1.5 font-medium">Mês</th>
                <th className="py-1.5 text-right font-medium">Receitas</th>
                <th className="py-1.5 text-right font-medium">Despesas</th>
                <th className="py-1.5 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((d) => (
                <tr key={d.month} className={cx(d.month === selected && "font-semibold")}>
                  <td className="py-2">{monthLabel(d.month)}</td>
                  <td className="py-2 text-right">{money(d.income)}</td>
                  <td className="py-2 text-right">{money(d.expense)}</td>
                  <td className={cx("py-2 text-right", d.net < 0 ? "text-negative" : "text-positive")}>
                    {money(d.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Legend series={CASHFLOW_SERIES} />
            <span className="text-xs text-muted">últimos 12 meses</span>
          </div>
          <CashflowChart data={data} selected={selected} />
        </>
      )}
    </Card>
  );
}

const CATEGORY_PREVIEW = 6;

export function CategoriesCard({ rows, keyById }: { rows: CategoryRow[]; keyById: Map<number, Category> }) {
  const [all, setAll] = useState(false);
  const visible = rows.filter((r) => r.spent > 0 || r.budget);
  const shown = all ? visible : visible.slice(0, CATEGORY_PREVIEW);
  const max = Math.max(1, ...visible.map((r) => Math.max(r.spent, r.budget ?? 0, r.average)));
  return (
    <Card data-enter>
      <CardTitle icon={Wallet} color="var(--cat-food)" hint="traço = média dos 3 meses anteriores">
        Para onde foi o dinheiro
      </CardTitle>
      {visible.length === 0 ? (
        <Empty icon={Wallet} color="var(--cat-food)">
          Sem gastos neste mês.
        </Empty>
      ) : (
        <>
          <ul className="grid divide-y divide-border">
            {shown.map((r) => {
              const cat = r.category_id ? keyById.get(r.category_id) : undefined;
              const { color } = categoryStyle(cat?.key, cat?.kind ?? "EXPENSE");
              const over = r.budget !== null && r.spent > r.budget;
              return (
                <li
                  key={r.category_id ?? "none"}
                  className="grid gap-2 py-3 first:pt-0 last:pb-0"
                  onMouseEnter={(e) => wiggle(e.currentTarget.querySelector("[data-wiggle]"))}
                >
                  <div className="flex items-center gap-3">
                    <span data-wiggle className="inline-grid">
                      <CategoryIcon categoryKey={cat?.key} kind={cat?.kind ?? "EXPENSE"} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.category_name}</p>
                      {(over || r.anomaly) && (
                        <p className="text-xs font-semibold">
                          {over && <span className="text-negative">■ Estourou o orçamento </span>}
                          {r.anomaly && r.change !== null && (
                            <span className="text-warning">▲ {percent(r.change)} acima da média</span>
                          )}
                          {r.anomaly && r.change === null && (
                            <span className="text-warning">▲ gasto novo nesta categoria</span>
                          )}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-right font-medium tabular">
                      {money(r.spent)}
                      {r.budget !== null && (
                        <span className="block text-xs font-medium text-muted">de {money(r.budget)}</span>
                      )}
                    </p>
                  </div>
                  <Meter
                    thin
                    value={r.spent / max}
                    marker={r.average > 0 ? r.average / max : undefined}
                    color={color}
                    label={`${r.category_name}: ${money(r.spent)}, média ${money(r.average)}`}
                  />
                </li>
              );
            })}
          </ul>
          {visible.length > CATEGORY_PREVIEW && (
            <Button variant="ghost" className="mt-3 w-full" onClick={() => setAll(!all)}>
              {all ? "Mostrar menos" : `Ver todas as ${visible.length} categorias`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

const LIST_PREVIEW = 6;

type ListRow = {
  key: string;
  lead: ReactNode;
  title: string;
  sub: string;
  value: string;
  valueSub?: string;
  bar?: number;
};

/**
 * Lista compartilhada pelos cards "Onde você mais gastou" e "Assinaturas": selo de 36px,
 * título + linha de apoio, valor à direita (sem quebrar) e, quando há, barra alinhada ao texto.
 */
export function ListRows({ rows, empty, more }: { rows: ListRow[]; empty: ReactNode; more: string }) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return <>{empty}</>;
  const shown = all ? rows : rows.slice(0, LIST_PREVIEW);
  return (
    <>
      <ul className="grid divide-y divide-border">
        {shown.map((r) => (
          <li key={r.key} className="grid gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              {r.lead}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.title}</p>
                <p className="truncate text-xs text-muted">{r.sub}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-medium whitespace-nowrap tabular">{r.value}</p>
                {r.valueSub && (
                  <p className="text-xs whitespace-nowrap text-muted tabular">{r.valueSub}</p>
                )}
              </div>
            </div>
            {r.bar !== undefined && (
              <div className="pl-12">
                <Meter thin value={r.bar} color="var(--cat-shop)" />
              </div>
            )}
          </li>
        ))}
      </ul>
      {rows.length > LIST_PREVIEW && (
        <Button variant="ghost" className="mt-3 w-full" onClick={() => setAll(!all)}>
          {all ? "Mostrar menos" : `Ver todos os ${rows.length} ${more}`}
        </Button>
      )}
    </>
  );
}

/** Posição no ranking, no mesmo formato de selo dos ícones de categoria. */
export function RankBadge({ n }: { n: number }) {
  return (
    <span
      style={tone("var(--cat-shop)")}
      className="tint grid size-9 shrink-0 place-items-center rounded-chip text-sm font-bold tabular"
      aria-label={`${n}º lugar`}
    >
      {n}
    </span>
  );
}

// --- Topo: regime de caixa no mês atual, resultado do mês nos meses fechados ------------

export function HeroCard({
  data,
  keyById,
  isCurrent,
}: {
  data: Data;
  keyById: Map<number, Category>;
  isCurrent: boolean;
}) {
  const s = data.summary;
  const value = isCurrent ? s.liquid_balance : s.net;
  const prev = monthName(shiftMonth(data.month, -1));
  const prevNet = s.previous_income - s.previous_expense;
  const hasPrev = s.previous_income > 0 || s.previous_expense > 0;
  const over = data.categories.find((r) => r.budget !== null && r.spent > r.budget);

  let mood: PilaMood = "neutral";
  let says: ReactNode = "Estou de olho por aqui.";
  if (over) {
    mood = "worried";
    says = <>{over.category_name} passou do orçamento.</>;
  } else if (isCurrent && hasPrev) {
    mood = prevNet >= 0 ? "happy" : "worried";
    says = prevNet >= 0 ? <>{capitalize(prev)} fechou no azul.</> : <>{capitalize(prev)} saiu mais do que entrou.</>;
  } else if (!isCurrent) {
    mood = s.net >= 0 ? "happy" : "worried";
    says = s.net >= 0 ? "Fechou no azul." : "Saiu mais do que entrou.";
  }

  return (
    <Card data-enter className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <p className="label uppercase">
          {isCurrent ? "Em conta agora" : `${s.net >= 0 ? "Sobrou" : "Faltou"} em ${monthName(data.month)}`}
        </p>
        <p
          className={cx(
            "text-[clamp(40px,7vw,60px)] leading-[1.05] font-light tracking-[-0.03em] tabular",
            value < 0 && "text-negative",
          )}
        >
          <span className="mr-1.5 align-[0.65em] text-[0.42em] font-semibold tracking-normal text-accent">
            {value < 0 ? "−R$" : "R$"}
          </span>
          <span data-hero-int>{intPart(value)}</span>
          <span data-hero-cents className="text-[0.45em] font-normal text-muted">
            {centsPart(value)}
          </span>
        </p>
        {isCurrent && (
          <p className="text-sm text-muted">
            Saldo das contas correntes, sem contar cofrinhos nem faturas.
          </p>
        )}
        <p className="max-w-[52ch] text-base leading-relaxed">
          {isCurrent ? <CashStory data={data} /> : <Story data={data} keyById={keyById} />}
        </p>
        <div className="mt-1">
          <PilaSays mood={mood} size={76} coin={mood === "happy"}>
            {says}
          </PilaSays>
        </div>
      </div>
      <ul className="grid content-start divide-y divide-border">
        <HeroRow
          icon={ArrowUpRight}
          color="var(--positive)"
          label={`Receitas de ${monthName(data.month)}`}
          value={money(s.income)}
          note={delta(s.income, s.previous_income, data.month, false)}
        />
        <HeroRow
          icon={ArrowDownRight}
          color="var(--negative)"
          label={`Despesas de ${monthName(data.month)}`}
          value={money(s.expense)}
          note={delta(s.expense, s.previous_expense, data.month, true)}
        />
        <HeroRow
          icon={CreditCard}
          color="var(--cat-move)"
          label="Faturas abertas"
          value={money(s.card_debt)}
          note={
            <span className="text-muted">
              {s.next_bill_due ? `próxima vence ${shortDate(s.next_bill_due)}` : "soma dos cartões hoje"}
            </span>
          }
        />
        <HeroRow
          icon={PiggyBank}
          color="var(--positive)"
          label="Guardado em cofrinhos"
          value={money(s.invested)}
          note={<span className="text-muted">conta na reserva</span>}
        />
      </ul>
    </Card>
  );
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Mês atual em regime de caixa: como fechou o mês anterior e o que já entrou e saiu. */
function CashStory({ data }: { data: Data }) {
  const s = data.summary;
  const prev = monthName(shiftMonth(data.month, -1));
  const prevNet = s.previous_income - s.previous_expense;
  return (
    <>
      {(s.previous_income > 0 || s.previous_expense > 0) && (
        <span>
          {capitalize(prev)} fechou com{" "}
          <Mark color={prevNet >= 0 ? "var(--positive)" : "var(--negative)"}>
            {prevNet >= 0 ? "+" : "−"}
            {money(Math.abs(prevNet))}
          </Mark>{" "}
          entre o que entrou e o que você gastou.{" "}
        </span>
      )}
      <span>
        Em {monthName(data.month)}, até agora, entraram <strong className="font-semibold">{money(s.income)}</strong>{" "}
        e saíram <strong className="font-semibold">{money(s.expense)}</strong>, contando o que já foi para o
        cartão.
      </span>
      {s.projected_expense !== null && (
        <span>
          {" "}No ritmo atual, os gastos do mês chegam a{" "}
          <strong className="font-semibold">{money(s.projected_expense)}</strong>.
        </span>
      )}
    </>
  );
}

// --- Cofrinhos ---------------------------------------------------------------------------

export function SavingsCard({ pots, looseTotal }: { pots: SavingsPot[]; looseTotal: number }) {
  const total = pots.reduce((sum, p) => sum + Number(p.balance), 0) + looseTotal;
  const reached = pots.find((p) => p.goal_amount && Number(p.balance) >= Number(p.goal_amount));
  const shown = pots.slice(0, LIST_PREVIEW);

  return (
    <Card data-enter className="grid content-start gap-4">
      <CardTitle
        icon={PiggyBank}
        color="var(--cat-care)"
        hint={
          <Link href="/cofrinhos" className="rounded-chip px-2 py-1 text-xs font-semibold text-accent hover:bg-surface-2">
            Organizar
          </Link>
        }
      >
        Cofrinhos
      </CardTitle>
      {total === 0 ? (
        <div className="grid justify-items-center gap-2 py-4">
          <PilaSays mood="sleep" size={84}>
            Ainda não achei cofrinhos. Sincronize em Contas.
          </PilaSays>
        </div>
      ) : (
        <>
          <p className="text-[28px] leading-tight font-light tracking-[-0.02em] tabular">{money(total)}</p>
          <ul className="grid divide-y divide-border">
            {shown.map((p) => {
              const balance = Number(p.balance);
              const goal = p.goal_amount ? Number(p.goal_amount) : null;
              return (
                <li key={p.id} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="shrink-0 font-medium whitespace-nowrap tabular">{money(balance)}</span>
                  </div>
                  <Meter
                    thin
                    value={goal ? balance / goal : balance / total}
                    color={goal ? "var(--cat-care)" : "color-mix(in oklab, var(--cat-care) 55%, transparent)"}
                    label={goal ? `${percent(balance / goal)} da meta` : `${percent(balance / total)} do total`}
                  />
                  <span className="text-xs text-muted tabular">
                    {goal
                      ? balance >= goal
                        ? "Meta atingida"
                        : `${percent(balance / goal)} da meta de ${money(goal)}`
                      : `${percent(balance / total)} do total guardado`}
                  </span>
                </li>
              );
            })}
          </ul>
          {pots.length > LIST_PREVIEW && (
            <Link href="/cofrinhos" className="text-sm font-semibold text-accent">
              Ver todos os {pots.length} cofrinhos
            </Link>
          )}
          {looseTotal > 0 && (
            <p className="text-xs text-muted">
              {money(looseTotal)} em aplicações sem cofrinho.{" "}
              <Link href="/cofrinhos" className="font-semibold text-accent">
                Organizar
              </Link>
            </p>
          )}
          {reached && (
            <PilaSays mood="happy" size={72} coin>
              {reached.name} bateu a meta!
            </PilaSays>
          )}
          <p className="text-xs text-muted">Contam na reserva de emergência, fora do saldo em conta.</p>
        </>
      )}
    </Card>
  );
}

// --- Parcelas ---------------------------------------------------------------------------

const MAX_SEGMENTS = 24;

export function InstallmentsCard({ items, keyById }: { items: Installment[]; keyById: Map<number, Category> }) {
  const [all, setAll] = useState(false);
  const remainingTotal = items.reduce((sum, i) => sum + i.remaining_amount, 0);
  const count = items.reduce((sum, i) => sum + i.remaining, 0);
  const last = items.reduce((m, i) => (i.last_month > m ? i.last_month : m), "");
  const shown = all ? items : items.slice(0, LIST_PREVIEW);
  return (
    <Card data-enter className="grid content-start gap-4">
      <CardTitle icon={CreditCard} color="var(--cat-move)">
        Parcelas em andamento
      </CardTitle>
      {items.length === 0 ? (
        <div className="grid justify-items-center py-4">
          <PilaSays mood="happy" size={84}>
            Nenhuma compra parcelada em andamento.
          </PilaSays>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            Faltam <strong className="font-semibold text-foreground tabular">{money(remainingTotal)}</strong> em{" "}
            {count} {count === 1 ? "parcela" : "parcelas"}. A última termina por volta de{" "}
            <strong className="font-semibold text-foreground">{monthLabel(last, "short").toLowerCase()}</strong>.
          </p>
          <ul className="grid divide-y divide-border">
            {shown.map((i, n) => {
              const cat = i.category_id ? keyById.get(i.category_id) : undefined;
              return (
                <li key={`${i.name}-${n}`} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <CategoryIcon categoryKey={cat?.key} kind={cat?.kind ?? "EXPENSE"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.name}</p>
                      <p className="truncate text-xs text-muted">{i.account_name}</p>
                    </div>
                    <p className="shrink-0 font-medium whitespace-nowrap tabular">
                      {money(i.installment_amount)}/mês
                    </p>
                  </div>
                  <div className="grid gap-1.5 pl-12">
                    {i.total <= MAX_SEGMENTS ? (
                      <div
                        className="grid gap-[3px]"
                        style={{ gridTemplateColumns: `repeat(${i.total}, minmax(0, 1fr))` }}
                        role="img"
                        aria-label={`${i.paid} de ${i.total} parcelas pagas`}
                      >
                        {Array.from({ length: i.total }, (_, k) => (
                          <i
                            key={k}
                            data-fill
                            className="block h-2 origin-left rounded-[3px]"
                            style={{ background: k < i.paid ? "var(--cat-move)" : "var(--surface-2)" }}
                          />
                        ))}
                      </div>
                    ) : (
                      <Meter thin value={i.paid / i.total} color="var(--cat-move)" label={`${i.paid} de ${i.total} pagas`} />
                    )}
                    <p className="text-xs text-muted tabular">
                      {i.paid} de {i.total} pagas, {i.remaining === 1 ? "falta 1" : `faltam ${i.remaining}`} (
                      {money(i.remaining_amount)})
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {items.length > LIST_PREVIEW && (
            <Button variant="ghost" className="w-full" onClick={() => setAll(!all)}>
              {all ? "Mostrar menos" : `Ver todas as ${items.length} compras`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

// --- Cards simples (antes direto na página) --------------------------------------------

export function PaceCard({ data }: { data: Data }) {
  return (
    <Card data-enter>
      <CardTitle icon={Gauge} color="var(--cat-move)" hint="gasto acumulado no mês">
        Ritmo de gastos
      </CardTitle>
      <div className="mb-3">
        <Legend series={DAILY_SERIES} />
      </div>
      <DailyChart data={data.daily} />
    </Card>
  );
}

export function CommitmentsCard({ data }: { data: Data }) {
  if (!data.commitments.some((c) => c.amount > 0)) return null;
  return (
    <Card data-enter>
      <CardTitle icon={CalendarClock} color="var(--cat-care)" hint="compras parceladas já feitas">
        Compromissos futuros
      </CardTitle>
      <div className="mb-3">
        <Legend series={[{ key: "amount", label: "Parcelas por mês", color: "var(--cat-move)" }]} />
      </div>
      <CommitmentsChart data={data.commitments} />
    </Card>
  );
}

export function MerchantsCard({ data }: { data: Data }) {
  return (
    <Card data-enter>
      <CardTitle icon={Store} color="var(--cat-shop)" hint={monthLabel(data.month)}>
        Onde você mais gastou
      </CardTitle>
      <ListRows
        empty={
          <Empty icon={Store} color="var(--cat-shop)">
            Sem gastos neste mês.
          </Empty>
        }
        more="estabelecimentos"
        rows={data.merchants.map((m, n) => ({
          key: m.name,
          lead: <RankBadge n={n + 1} />,
          title: m.name,
          sub: `${m.count} ${m.count === 1 ? "compra" : "compras"}`,
          value: money(m.total),
          bar: m.total / Math.max(...data.merchants.map((x) => x.total)),
        }))}
      />
    </Card>
  );
}

export function RecurringCard({ data }: { data: Data }) {
  const byName = new Map(data.catalog.map((c) => [c.name, c]));
  return (
    <Card data-enter>
      <CardTitle icon={Repeat} color="var(--cat-fun)" hint="detectados nos últimos 6 meses">
        Assinaturas e gastos fixos
      </CardTitle>
      <ListRows
        empty={
          <Empty icon={Repeat} color="var(--cat-fun)">
            Nenhum gasto recorrente detectado ainda. São precisos 3 meses de histórico.
          </Empty>
        }
        more="gastos fixos"
        rows={data.recurring.map((r, i) => {
          const cat = byName.get(r.category_name);
          return {
            key: `${r.name}-${i}`,
            lead: <CategoryIcon categoryKey={cat?.key} kind={cat?.kind} />,
            title: r.name,
            sub: `${r.category_name}, última em ${shortDate(r.last_date)}`,
            value: `${money(r.monthly_amount)}/mês`,
            valueSub: `${money(r.annual_amount)}/ano`,
          };
        })}
      />
    </Card>
  );
}
