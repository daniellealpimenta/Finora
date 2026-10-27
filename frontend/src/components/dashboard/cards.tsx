"use client";

import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarClock,
  ChartColumn,
  CreditCard,
  Gauge,
  Heart,
  Info,
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
import { InfoTip } from "@/components/info-tip";
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
import { Guilloche } from "@/components/guilloche";
import { Odometer } from "@/components/odometer";
import {
  Button,
  Card,
  CardTitle,
  Empty,
  IconBadge,
  Meter,
  Pill,
  STATUS_COLOR,
  StatusShape,
  cx,
  tone,
  type Status,
} from "@/components/ui";
import type { Category, Installment, SavingsPot } from "@/lib/api";
import { cycleName, cycleRange } from "@/lib/cycle";
import { earnedText, money, outflow, monthLabel, percent, shiftMonth, shortDate } from "@/lib/format";
import { wiggle } from "@/lib/motion";
import {
  INFO_CASHFLOW,
  INFO_CATEGORIES,
  INFO_COMMITMENTS,
  INFO_CURRENT_BALANCE,
  INFO_FIXED,
  INFO_HEALTH,
  INFO_INSTALLMENTS,
  INFO_MERCHANTS,
  INFO_MONTH_LEFT,
  INFO_PACE,
  INFO_RECURRING,
  INFO_RESERVE,
  INFO_SAVINGS,
} from "./info";
import type { CategoryRow, CycleNote, Data, Summary } from "./types";

// Limites iguais aos do score do backend (app/services/analytics.py::_health_score)
const RESERVE_GOAL_MONTHS = 6;
const FIXED_IDEAL = 0.3;
const RING_RADIUS = 27;
export const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const healthStatus = (score: number): Status => (score >= 70 ? "ok" : score >= 40 ? "warn" : "bad");
const pointsStatus = (points: number, max: number): Status =>
  points / max >= 2 / 3 ? "ok" : points / max >= 1 / 3 ? "warn" : "bad";
const STATUS_LABEL: Record<Status, string> = { ok: "Boa", warn: "Atenção", bad: "Crítica" };

export const intPart = (v: number) =>
  Number.isFinite(Number(v)) ? Math.floor(Math.abs(v)).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
export const centsPart = (v: number) =>
  Number.isFinite(Number(v)) ? "," + String(Math.round((Math.abs(v) % 1) * 100) % 100).padStart(2, "0") : "";

/** Frase-resumo em linguagem natural, só com números da API. */
export function Story({ data, keyById }: { data: Data; keyById: Map<number, Category> }) {
  const s = data.summary;
  const prev = `no ciclo de ${cycleName(shiftMonth(data.month, -1))}`;
  const parts: ReactNode[] = [];

  if (s.expense > 0 && s.previous_expense > 0) {
    const change = (s.expense - s.previous_expense) / s.previous_expense;
    if (Math.abs(change) < 0.01) {
      parts.push(<>Você gastou praticamente o mesmo que {prev}</>);
    } else {
      const less = change < 0;
      parts.push(
        <>
          Você gastou{" "}
          <Mark color={less ? "var(--positive)" : "var(--negative)"}>
            {percent(Math.abs(change))} {less ? "menos" : "mais"}
          </Mark>{" "}
          que {prev}
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
    parts.push(<>Você gastou {money(s.expense)} no ciclo de {cycleName(data.month)}</>);
  } else {
    parts.push(<>Nenhuma despesa registrada no ciclo de {cycleName(data.month)}</>);
  }

  if (s.savings_rate !== null && s.savings_rate >= 0) {
    parts.push(
      <>
        {" "}e gastou <strong className="font-semibold">{percent(1 - s.savings_rate)}</strong> do que entrou.
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
        {" "}No ritmo atual, as despesas do ciclo devem chegar a{" "}
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
  info,
}: {
  icon: typeof Heart;
  color: string;
  title: string;
  status: Status | null;
  shine?: boolean;
  info: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2.5">
        <IconBadge icon={icon} color={color} size="sm" />
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="-ml-1.5">
          <InfoTip label={title}>{info}</InfoTip>
        </span>
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
    { label: "Taxa de poupança", points: health.savings_points, max: 40 },
    { label: "Reserva", points: health.reserve_points, max: 30 },
    { label: "Gastos fixos", points: health.commitment_points, max: 30 },
  ];
  return (
    <Card data-enter className="grid content-start gap-4">
      <IndexHeader icon={Heart} color="var(--cat-care)" title="Saúde financeira" status={status} shine info={INFO_HEALTH} />
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
        <p className="text-[28px] leading-tight font-display font-normal tracking-[-0.02em] tabular">
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
      <IndexHeader icon={Shield} color="var(--cat-home)" title="Reserva de emergência" status={status} info={INFO_RESERVE} />
      <p className="text-[28px] leading-tight font-display font-normal tracking-[-0.02em] tabular">
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
        <div className="flex justify-between text-xs text-muted tabular">
          <span>0</span>
          <span>meta: {RESERVE_GOAL_MONTHS} meses</span>
        </div>
      </div>
      <p className="text-[13px] leading-normal text-muted">
        Quanto tempo o saldo em conta (sem o que já é das faturas) mais os cofrinhos cobrem o seu gasto médio (
        {money(avg)} por ciclo) se a renda parar.
      </p>
    </Card>
  );
}

export function FixedCard({
  commitment,
  monthly,
  installments,
}: {
  commitment: number | null;
  monthly: number;
  installments: number;
}) {
  const total = monthly + installments;
  const status: Status | null =
    commitment === null ? null : commitment <= FIXED_IDEAL ? "ok" : commitment <= 0.5 ? "warn" : "bad";
  return (
    <Card data-enter className="grid content-start gap-4">
      <IndexHeader icon={Repeat} color="var(--cat-move)" title="Gastos fixos" status={status} info={INFO_FIXED} />
      <p className="text-[28px] leading-tight font-display font-normal tracking-[-0.02em] tabular">
        {commitment === null ? money(total) : percent(commitment)}
        <span className="text-sm font-medium tracking-normal text-muted">
          {commitment === null ? " por ciclo" : " da renda"}
        </span>
      </p>
      <div className="grid gap-1.5">
        <Meter
          value={commitment ?? 0}
          marker={FIXED_IDEAL}
          color={status ? STATUS_COLOR[status] : "var(--muted)"}
          label={commitment === null ? undefined : `${percent(commitment)} da renda`}
        />
        <div className="flex justify-between text-xs text-muted tabular">
          <span>0%</span>
          <span>ideal: até {percent(FIXED_IDEAL)}</span>
        </div>
      </div>
      <p className="text-[13px] leading-normal text-muted">
        Assinaturas e contas recorrentes somam {money(monthly)} por ciclo
        {installments > 0 ? <>, e as parcelas, mais {money(installments)}.</> : "."}
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
        info={INFO_CASHFLOW}
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
                <th className="py-1.5 font-medium">Ciclo</th>
                <th className="py-1.5 text-right font-medium">Receitas</th>
                <th className="py-1.5 text-right font-medium">Despesas</th>
                <th className="py-1.5 text-right font-medium">Diferença</th>
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
            <span className="text-xs text-muted">últimos 12 ciclos</span>
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
      <CardTitle
        icon={Wallet}
        color="var(--cat-food)"
        hint="traço = média dos 3 ciclos anteriores"
        info={INFO_CATEGORIES}
      >
        Para onde foi o dinheiro
      </CardTitle>
      {visible.length === 0 ? (
        <Empty icon={Wallet} color="var(--cat-food)">
          Sem gastos neste ciclo.
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

// --- Topo: a conta do ciclo -------------------------------------------------------------

/** Valor grande do topo: livre agora (ciclo atual) ou com quanto o ciclo terminou (encerrados),
 * que é o que bate com o banco. O resultado do ciclo sozinho vai numa frase embaixo. */
export const heroValueOf = (s: Summary) => s.flow.ended_with;

export function HeroCard({ data, keyById }: { data: Data; keyById: Map<number, Category> }) {
  const s = data.summary;
  const f = s.flow;
  const isCurrent = s.cycle.is_current;
  const value = heroValueOf(s);
  const name = cycleName(data.month);
  const prev = cycleName(shiftMonth(data.month, -1));
  const hasPrev = s.previous_income > 0 || s.previous_expense > 0;
  const over = data.categories.find((r) => r.budget !== null && r.spent > r.budget);

  let mood: PilaMood = "neutral";
  let says: ReactNode = "Estou de olho por aqui.";
  if (over) {
    mood = "worried";
    says = <>{over.category_name} passou do orçamento.</>;
  } else if (isCurrent && hasPrev) {
    mood = s.previous_result >= 0 ? "happy" : "worried";
    says =
      s.previous_result >= 0 ? (
        <>O ciclo de {prev} fechou no azul.</>
      ) : (
        <>No ciclo de {prev} saiu mais do que entrou.</>
      );
  } else if (!isCurrent) {
    mood = f.result >= 0 ? "happy" : "worried";
    says = f.result >= 0 ? "Fechou no azul." : "Saiu mais do que entrou.";
  }

  return (
    <Card data-enter className="relative isolate grid gap-6 overflow-hidden md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      {/* O padrão das cédulas atrás do número; só neste card e no login */}
      <Guilloche className="-z-10" x={0.3} y={0.2} />
      <div className="grid content-start gap-3">
        <p className="label flex items-center gap-1">
          {isCurrent ? "Livre agora" : `Terminou o ciclo de ${name} com`}
          <InfoTip label={isCurrent ? "Livre agora" : "Terminou com"}>
            {isCurrent ? INFO_CURRENT_BALANCE : INFO_MONTH_LEFT}
          </InfoTip>
        </p>
        <p
          className={cx(
            "text-[clamp(40px,7vw,60px)] leading-[1.05] font-display font-normal tracking-[-0.03em] tabular",
            value < 0 && "text-negative",
          )}
        >
          <span className="mr-1.5 align-[0.65em] text-[0.42em] font-semibold tracking-normal text-accent">
            {value < 0 ? "−R$" : "R$"}
          </span>
          <Odometer text={intPart(value)} />
          <Odometer text={centsPart(value)} className="text-[0.45em] font-normal text-muted" />
        </p>
        {isCurrent ? (
          <InAccountNow summary={s} />
        ) : (
          <CycleResult summary={s} />
        )}
        <CycleNotes summary={s} />
        <p className="max-w-[52ch] text-base leading-relaxed">
          {isCurrent ? <CashStory data={data} /> : <Story data={data} keyById={keyById} />}
        </p>
        <div className="mt-1">
          <PilaSays mood={mood} size={76} coin={mood === "happy"}>
            {says}
          </PilaSays>
        </div>
      </div>
      <CycleRows data={data} />
    </Card>
  );
}


const signed = (v: number) => (v < 0 ? outflow(-v) : `+${money(v)}`);

/** A conta do ciclo, de cima para baixo: começou com, entradas, saídas, terminou com. */
function CycleRows({ data }: { data: Data }) {
  const s = data.summary;
  const f = s.flow;
  const isCurrent = s.cycle.is_current;
  const prev = cycleName(shiftMonth(data.month, -1));
  const soFar = isCurrent ? " até agora" : "";
  const billNote = f.bills.length
    ? f.bills
        .filter((b) => Number(b.amount) > 0)
        .map((b) => `${b.bank} ${money(b.amount)}${b.status === "open" ? " (aberta)" : ""}`)
        .join(", ")
    : "nenhuma fatura fecha neste ciclo";
  return (
    <div className="grid content-start gap-3">
      <ul className="grid content-start divide-y divide-border" aria-label={`Conta do ciclo de ${cycleName(data.month)}`}>
        <HeroRow
          icon={Wallet}
          color="var(--muted)"
          label="Começou com"
          value={signed(f.started_with).replace(/^\+/, "")}
          note={<span className="text-muted">o que sobrou até o ciclo de {prev}</span>}
        />
        <HeroRow
          icon={ArrowUpRight}
          color="var(--positive)"
          label={`Entrou na conta${soFar}`}
          value={`+${money(f.income)}`}
          note={<span className="text-muted">salário, Pix recebidos e outras receitas</span>}
        />
        <HeroRow
          icon={ArrowDownRight}
          color="var(--negative)"
          label="Gastos pela conta"
          value={outflow(f.spent)}
          note={<span className="text-muted">Pix, débito e boletos</span>}
        />
        <HeroRow
          icon={CreditCard}
          color="var(--cat-move)"
          label={isCurrent ? "Faturas do ciclo até agora" : "Faturas do ciclo"}
          value={outflow(f.card_bills)}
          note={<span className="text-muted">{billNote}</span>}
        />
        <HeroRow
          icon={PiggyBank}
          color="var(--cat-care)"
          label="Guardado nos cofrinhos"
          value={f.saved >= 0 ? outflow(f.saved) : `+${money(-f.saved)}`}
          note={<span className="text-muted">{f.saved >= 0 ? "aportes menos resgates" : "resgatou mais do que guardou"}</span>}
        />
        {Math.abs(f.other) >= 0.01 && (
          <HeroRow
            icon={ArrowLeftRight}
            color="var(--muted)"
            label="Outras transferências"
            value={signed(f.other)}
            note={<span className="text-muted">para contas não conectadas</span>}
          />
        )}
        <li className="flex items-center justify-between gap-3 py-3 last:pb-0">
          <span className="text-sm font-semibold">{isCurrent ? "Livre agora" : "Terminou com"}</span>
          <span className={cx("text-[17px] font-semibold tabular", f.ended_with < 0 && "text-negative")}>
            {money(f.ended_with)}
          </span>
        </li>
      </ul>
      {f.check && <CheckNote check={f.check} />}
    </div>
  );
}

/** Ciclo atual: o saldo real das contas em destaque e a conta que leva dele ao "livre agora". */
function InAccountNow({ summary: s }: { summary: Summary }) {
  const reserved = s.liquid_balance - s.flow.ended_with;
  const cycleNote = (
    <>
      Ciclo de {cycleName(s.cycle.key)}, {cycleRange(s.cycle)}. Cofrinhos ficam fora: {money(s.invested)}.
    </>
  );
  // Nada comprometido: "em conta" é o próprio número herói; repetir só faz ruído
  if (Math.abs(reserved) < 0.005) {
    return (
      <p className="text-xs leading-relaxed text-muted">
        Nada comprometido com faturas: todo o saldo em conta está livre. {cycleNote}
      </p>
    );
  }
  return (
    <div className="grid gap-2 rounded-control bg-surface-2 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="flex items-center gap-2.5">
          <IconBadge icon={Wallet} color="var(--cat-fun)" size="sm" />
          <span className="text-sm font-medium">Em conta agora</span>
        </span>
        <span
          className={cx(
            "text-[clamp(24px,4vw,30px)] leading-tight font-display font-normal tracking-[-0.02em] tabular",
            s.liquid_balance < 0 && "text-negative",
          )}
        >
          {money(s.liquid_balance)}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted tabular">
        {money(s.liquid_balance)} em conta − {money(reserved)} já comprometidos com faturas ={" "}
        <strong className="font-semibold text-foreground">{money(s.flow.ended_with)} livres</strong>
        {s.next_bill_due && s.next_bill_amount !== null
          ? `. Próxima fatura: ${money(s.next_bill_amount)}, vence ${shortDate(s.next_bill_due)}.`
          : "."}
      </p>
      <p className="text-xs text-muted">{cycleNote}</p>
    </div>
  );
}

/** Conferência do ciclo encerrado com o saldo real do banco no fim dele. */
function CheckNote({ check }: { check: NonNullable<Summary["flow"]["check"]> }) {
  const ok = Math.abs(check.difference) < 0.01;
  return (
    <p
      style={tone(ok ? "var(--positive)" : "var(--warning)")}
      className="tint flex items-start gap-2 rounded-control px-3 py-2 text-xs leading-relaxed"
    >
      <StatusShape status={ok ? "ok" : "warn"} className="mt-0.5" />
      <span>
        {ok ? "Bate com o banco: " : `Diferença de ${money(Math.abs(check.difference))} com o banco: `}
        {money(check.balance)} em conta no fim do ciclo
        {Number(check.unpaid_bills) !== 0 && ` − ${money(check.unpaid_bills)} de faturas ainda a pagar`}
        {" = "}
        {money(check.free)}.{!ok && " Pode ser um saque ou um Pix para uma conta que não está conectada."}
      </span>
    </p>
  );
}

/** Ciclo encerrado: o que o ciclo sozinho fez com o dinheiro, sem misturar com o que já havia.
 * O que foi para os cofrinhos sai da conta, mas continua sendo do usuário: o texto mostra os dois. */
function CycleResult({ summary: s }: { summary: Summary }) {
  const f = s.flow;
  const prev = cycleName(shiftMonth(s.cycle.key, -1));
  const result = Number(f.result);
  const started = Number(f.started_with);
  const saved = Number(f.saved);
  const withoutSaving = result + saved;
  return (
    <div className="grid gap-1.5 rounded-control border border-border p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">Resultado do ciclo</span>
        <Mark color={result >= 0 ? "var(--positive)" : "var(--negative)"}>
          {result >= 0 ? "+" : "−"}
          {money(Math.abs(result))}
        </Mark>
      </div>
      <p className="text-xs leading-relaxed text-muted tabular">
        De {cycleRange(s.cycle)}{" "}
        {result >= 0 ? (
          <>entrou mais do que saiu: sobraram {money(result)}.</>
        ) : (
          <>saiu {money(-result)} a mais do que entrou.</>
        )}
        {saved >= 0.01 &&
          (result >= 0 ? (
            <> E isso já depois de guardar {money(saved)} nos cofrinhos.</>
          ) : (
            <>
              {" "}Mas {money(saved)} dessas saídas foram para os cofrinhos, e esse dinheiro continua seu. Sem
              contar o que você guardou,{" "}
              <strong className="font-semibold text-foreground">
                {withoutSaving >= 0 ? `sobraram ${money(withoutSaving)}` : `faltaram ${money(-withoutSaving)}`}
              </strong>
              .
            </>
          ))}
        {Math.abs(started) >= 0.01 && (
          <>
            {" "}Você começou o ciclo com {money(started)} (o que sobrou até {prev}) e terminou com{" "}
            {money(f.ended_with)} livres.
          </>
        )}
      </p>
    </div>
  );
}

/** Avisos que mudam a leitura do resultado: algo de todo ciclo que caiu na virada, faturas pagas
 * no ciclo seguinte, resgates dos cofrinhos (analytics.cycle_notes). */
function CycleNotes({ summary: s }: { summary: Summary }) {
  if (!s.notes?.length) return null;
  return (
    <div className="grid gap-1.5">
      <p className="label">Para entender este resultado</p>
      <ul className="grid gap-1.5">
        {s.notes.map((n, i) => {
          const warn = n.kind === "shifted_out" || n.kind === "doubled";
          return (
            <li
              key={i}
              style={warn ? tone("var(--warning)") : undefined}
              className={cx(
                "flex items-start gap-2 rounded-control px-3 py-2 text-xs leading-relaxed",
                warn ? "tint" : "border border-border text-muted",
              )}
            >
              {warn ? (
                <StatusShape status="warn" className="mt-0.5" />
              ) : (
                <Info aria-hidden className="mt-px size-3.5 shrink-0" />
              )}
              <span className="tabular">{noteText(n, s)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function noteText(n: CycleNote, s: Summary): ReactNode {
  const next = cycleName(shiftMonth(s.cycle.key, 1));
  const prev = cycleName(shiftMonth(s.cycle.key, -1));
  switch (n.kind) {
    case "shifted_out": {
      const [better, worse] = n.income ? ["pior", "melhor"] : ["melhor", "pior"];
      return (
        <>
          <strong className="font-semibold">{n.category_name}</strong> ({n.label}): os {money(n.amount)} que caem todo
          ciclo não caíram neste. Caíram em {shortDate(n.dates[0])}, já no ciclo de {next}. Por isso este ciclo parece{" "}
          {money(n.amount)} {better}, e o de {next}, {worse}.
        </>
      );
    }
    case "doubled":
      return (
        <>
          <strong className="font-semibold">{n.category_name}</strong> ({n.label}): {money(n.amount)} caiu duas vezes
          neste ciclo ({n.dates.map(shortDate).join(" e ")}) e nenhuma no de {prev}. Um deles deve ser do ciclo de{" "}
          {prev}: sem ele, o resultado seria {money(n.amount)} {n.income ? "menor" : "melhor"}.
        </>
      );
    case "bills_after":
      return (
        <>
          {n.bills.map((b) => `${b.bank} ${money(b.amount)} (vence ${shortDate(b.due_date)})`).join(", ")}:{" "}
          {n.bills.length > 1 ? "essas faturas fecharam" : "essa fatura fechou"} neste ciclo e{" "}
          {n.bills.length > 1 ? "vencem" : "vence"} já no seguinte, mas o valor está descontado aqui.
          {s.flow.check && (
            <>
              {" "}Por isso, no fim do ciclo, o banco mostrava {money(s.flow.check.balance)} em conta, mas só{" "}
              {money(s.flow.check.free)} estavam livres.
            </>
          )}
        </>
      );
    case "withdrew":
      return (
        <>
          Você resgatou {money(n.amount)} dos cofrinhos a mais do que guardou. O resgate entrou como dinheiro do ciclo e
          ajudou no resultado.
        </>
      );
  }
}

/** Ciclo atual: como fechou o ciclo anterior e o que já entrou e saiu neste. */
function CashStory({ data }: { data: Data }) {
  const s = data.summary;
  const prev = cycleName(shiftMonth(data.month, -1));
  return (
    <>
      {(s.previous_income > 0 || s.previous_expense > 0) && (
        <span>
          No ciclo de {prev}, {s.previous_result >= 0 ? "sobraram" : "saiu a mais do que entrou"}{" "}
          <Mark color={s.previous_result >= 0 ? "var(--positive)" : "var(--negative)"}>
            {money(Math.abs(s.previous_result))}
          </Mark>
          , e você começou este ciclo com {money(s.flow.started_with)}.{" "}
        </span>
      )}
      <span>
        Neste ciclo, até agora, entraram <strong className="font-semibold">{money(s.income)}</strong> e você gastou{" "}
        <strong className="font-semibold">{money(s.expense)}</strong>, contando as compras da fatura.
      </span>
      {s.projected_expense !== null && (
        <span>
          {" "}No ritmo atual, os gastos do ciclo chegam a{" "}
          <strong className="font-semibold">{money(s.projected_expense)}</strong>.
        </span>
      )}
    </>
  );
}

// --- Cofrinhos ---------------------------------------------------------------------------

export function SavingsCard({
  pots,
  looseTotal,
  saved,
  month,
}: {
  pots: SavingsPot[];
  looseTotal: number;
  /** Aportes menos resgates no ciclo escolhido (summary.flow.saved) */
  saved: number;
  month: string;
}) {
  const total = pots.reduce((sum, p) => sum + Number(p.balance), 0) + looseTotal;
  const reached = pots.find((p) => p.goal_amount && Number(p.balance) >= Number(p.goal_amount));
  const shown = pots.slice(0, LIST_PREVIEW);

  return (
    <Card data-enter className="grid content-start gap-4">
      <CardTitle
        icon={PiggyBank}
        color="var(--cat-care)"
        info={INFO_SAVINGS}
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
          <div className="grid gap-0.5">
            <p className="text-[28px] leading-tight font-display font-normal tracking-[-0.02em] tabular">{money(total)}</p>
            {Math.abs(saved) >= 0.01 && (
              <p className={cx("text-xs font-semibold tabular", saved > 0 ? "text-positive" : "text-muted")}>
                {saved > 0
                  ? `+${money(saved)} guardados no ciclo de ${cycleName(month)}`
                  : `${money(-saved)} resgatados no ciclo de ${cycleName(month)}`}
              </p>
            )}
          </div>
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
                  <span className="flex flex-wrap justify-between gap-x-3 text-xs text-muted tabular">
                    <span>
                      {goal
                        ? balance >= goal
                          ? "Meta atingida"
                          : `${percent(balance / goal)} da meta de ${money(goal)}`
                        : `${percent(balance / total)} do total guardado`}
                    </span>
                    {Number(p.earned) !== 0 && (
                      <span className={cx(Number(p.earned) > 0 && "font-semibold text-positive")}>
                        rendeu {earnedText(p.earned, p.applied)}
                      </span>
                    )}
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
      <CardTitle icon={CreditCard} color="var(--cat-move)" info={INFO_INSTALLMENTS}>
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

/**
 * Ritmo: quanto já foi gasto no ciclo contra o ciclo anterior no mesmo dia do ciclo. Os
 * números vêm primeiro (é a resposta); o gráfico mostra o caminho até eles.
 */
export function PaceCard({ data }: { data: Data }) {
  const s = data.summary;
  const points = data.daily;
  const filled = points.filter((p) => p.current !== null);
  const last = filled[filled.length - 1];
  if (!last) return null;
  const day = last.day;
  const spent = Number(last.current);
  const prevSame = last.previous === null ? null : Number(last.previous);
  const prevTotal = Number([...points].reverse().find((p) => p.previous !== null)?.previous ?? 0);
  const diff = prevSame === null ? null : spent - prevSame;
  const faster = diff !== null && diff > 0;
  const projected = s.projected_expense === null ? null : Number(s.projected_expense);
  const isCurrent = s.cycle.is_current;

  return (
    <Card data-enter>
      <CardTitle icon={Gauge} color="var(--cat-move)" hint={isCurrent ? `dia ${day} de ${points.length}` : "ciclo inteiro"} info={INFO_PACE}>
        Ritmo de gastos
      </CardTitle>
      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="grid gap-0.5">
          <span className="label">{isCurrent ? "Gasto até hoje" : "Gasto no ciclo"}</span>
          <span className="text-[26px] leading-tight font-display font-normal tracking-[-0.02em] tabular">{money(spent)}</span>
          <span className="text-xs text-muted tabular">{money(spent / Math.max(day, 1))} por dia</span>
        </div>
        <div className="grid gap-0.5">
          <span className="label">{isCurrent ? `Ciclo anterior no dia ${day}` : "Ciclo anterior"}</span>
          <span className="text-[26px] leading-tight font-display font-normal tracking-[-0.02em] text-muted tabular">
            {prevSame === null ? "—" : money(isCurrent ? prevSame : prevTotal)}
          </span>
          <span className="text-xs text-muted tabular">
            {isCurrent && prevTotal > 0 ? `fechou em ${money(prevTotal)}` : " "}
          </span>
        </div>
      </div>
      {diff !== null && Math.abs(diff) >= 1 && (
        <p
          style={tone(faster ? "var(--warning)" : "var(--positive)")}
          className="tint mb-4 flex items-start gap-2 rounded-control px-3 py-2 text-sm leading-relaxed"
        >
          <StatusShape status={faster ? "warn" : "ok"} className="mt-1" />
          <span>
            {money(Math.abs(diff))} {faster ? "a mais" : "a menos"} que o ciclo anterior
            {isCurrent ? " no mesmo ponto" : ""}.
            {isCurrent && projected !== null && (
              <> No ritmo atual, o ciclo fecha perto de {money(projected)}.</>
            )}
          </span>
        </p>
      )}
      <div className="mb-2">
        <Legend series={DAILY_SERIES} />
      </div>
      <DailyChart data={points} today={isCurrent ? day : undefined} />
    </Card>
  );
}

export function CommitmentsCard({ data }: { data: Data }) {
  if (!data.commitments.some((c) => c.amount > 0)) return null;
  return (
    <Card data-enter>
      <CardTitle
        icon={CalendarClock}
        color="var(--cat-care)"
        hint="compras parceladas já feitas"
        info={INFO_COMMITMENTS}
      >
        Compromissos futuros
      </CardTitle>
      <div className="mb-3">
        <Legend series={[{ key: "amount", label: "Parcelas por ciclo", color: "var(--cat-move)" }]} />
      </div>
      <CommitmentsChart data={data.commitments} />
    </Card>
  );
}

export function MerchantsCard({ data }: { data: Data }) {
  return (
    <Card data-enter>
      <CardTitle icon={Store} color="var(--cat-shop)" hint={`ciclo de ${cycleName(data.month)}`} info={INFO_MERCHANTS}>
        Onde você mais gastou
      </CardTitle>
      <ListRows
        empty={
          <Empty icon={Store} color="var(--cat-shop)">
            Sem gastos neste ciclo.
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
      <CardTitle
        icon={Repeat}
        color="var(--cat-fun)"
        hint="detectados nos últimos 6 ciclos"
        info={INFO_RECURRING}
      >
        Assinaturas e gastos fixos
      </CardTitle>
      <ListRows
        empty={
          <Empty icon={Repeat} color="var(--cat-fun)">
            Nenhum gasto recorrente detectado ainda. São precisos 3 ciclos de histórico.
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
