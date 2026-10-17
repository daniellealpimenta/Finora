"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  CASHFLOW_SERIES,
  CashflowChart,
  CommitmentsChart,
  DAILY_SERIES,
  DailyChart,
  Legend,
  type CashflowPoint,
  type DailyPoint,
} from "@/components/charts";
import { Button, Card, CardTitle, Empty, ErrorNote, MonthPicker, PageHeader, cx } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { currentMonth, money, monthLabel, percent, shortDate } from "@/lib/format";

type Summary = {
  income: number;
  expense: number;
  net: number;
  previous_income: number;
  previous_expense: number;
  savings_rate: number | null;
  projected_expense: number | null;
  liquid_balance: number;
  card_debt: number;
  avg_monthly_expense: number;
  emergency_reserve_months: number | null;
  fixed_monthly: number;
  fixed_commitment: number | null;
  health: { score: number; savings_points: number; reserve_points: number; commitment_points: number };
};
type CategoryRow = {
  category_id: number | null;
  category_name: string;
  spent: number;
  average: number;
  change: number | null;
  anomaly: boolean;
  budget: number | null;
};
type Merchant = { name: string; total: number; count: number };
type Recurring = {
  name: string;
  category_name: string;
  monthly_amount: number;
  annual_amount: number;
  months_seen: number;
  last_date: string;
};
type Commitment = { month: string; amount: number };

type Data = {
  summary: Summary;
  cashflow: CashflowPoint[];
  categories: CategoryRow[];
  daily: DailyPoint[];
  merchants: Merchant[];
  recurring: Recurring[];
  commitments: Commitment[];
};

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = qs({ month });
    Promise.all([
      api<Summary>(`/dashboard/summary${q}`),
      api<CashflowPoint[]>(`/dashboard/cashflow${q}`),
      api<CategoryRow[]>(`/dashboard/categories${q}`),
      api<DailyPoint[]>(`/dashboard/daily${q}`),
      api<Merchant[]>(`/dashboard/merchants${q}`),
      api<Recurring[]>("/dashboard/recurring"),
      api<Commitment[]>("/dashboard/commitments"),
    ])
      .then(([summary, cashflow, categories, daily, merchants, recurring, commitments]) => {
        // No mês corrente, a linha "este mês" para no dia de hoje
        if (month === currentMonth()) {
          const today = new Date().getDate();
          daily = daily.map((d) => (d.day > today ? { ...d, current: null } : d));
        }
        setData({ summary, cashflow, categories, daily, merchants, recurring, commitments });
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [month]);

  const s = data?.summary;
  const hasData = data && data.cashflow.some((c) => c.income > 0 || c.expense > 0);

  return (
    <>
      <PageHeader title="Visão geral" actions={<MonthPicker value={month} onChange={setMonth} />} />
      {error && <ErrorNote>{error}</ErrorNote>}

      {data && !hasData && (
        <Card>
          <Empty>
            Ainda não há transações. Conecte um banco ou importe um extrato em{" "}
            <Link href="/contas" className="text-accent underline">
              Contas
            </Link>
            .
          </Empty>
        </Card>
      )}

      {s && hasData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Receitas"
              value={money(s.income)}
              note={delta(s.income, s.previous_income, "mês anterior", false)}
            />
            <Stat
              label="Despesas"
              value={money(s.expense)}
              note={
                s.projected_expense !== null
                  ? `projeção do mês: ${money(s.projected_expense)}`
                  : delta(s.expense, s.previous_expense, "mês anterior", true)
              }
            />
            <Stat
              label="Taxa de poupança"
              value={s.savings_rate === null ? "—" : percent(s.savings_rate)}
              note={`sobrou ${money(s.net)}`}
              tone={s.savings_rate === null ? undefined : s.savings_rate >= 0 ? "positive" : "negative"}
            />
            <HealthStat health={s.health} />
            <Stat label="Saldo em conta" value={money(s.liquid_balance)} note="corrente + poupança" />
            <Stat
              label="Fatura do cartão"
              value={money(s.card_debt)}
              note="valor devido hoje"
            />
            <Stat
              label="Reserva de emergência"
              value={
                s.emergency_reserve_months === null
                  ? "—"
                  : `${s.emergency_reserve_months.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses`
              }
              note={`gasto médio ${money(s.avg_monthly_expense)}/mês`}
            />
            <Stat
              label="Gastos fixos"
              value={money(s.fixed_monthly)}
              note={
                s.fixed_commitment === null
                  ? "assinaturas e contas recorrentes"
                  : `${percent(s.fixed_commitment)} da renda`
              }
            />
          </div>

          <CashflowCard data={data.cashflow} />

          <div className="grid gap-4 lg:grid-cols-2">
            <CategoriesCard rows={data.categories} />
            <Card>
              <CardTitle hint="gasto acumulado">Ritmo de gastos</CardTitle>
              <div className="mb-2">
                <Legend series={DAILY_SERIES} shape="line" />
              </div>
              <DailyChart data={data.daily} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle hint={monthLabel(month)}>Onde você mais gastou</CardTitle>
              <RankList
                items={data.merchants.map((m) => ({
                  label: m.name,
                  sub: `${m.count} ${m.count === 1 ? "compra" : "compras"}`,
                  value: m.total,
                }))}
              />
            </Card>
            <Card>
              <CardTitle hint="detectadas nos últimos 6 meses">Assinaturas e gastos fixos</CardTitle>
              {data.recurring.length === 0 ? (
                <Empty>Nenhum gasto recorrente detectado ainda (precisa de 3 meses).</Empty>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.recurring.map((r, i) => (
                    <li key={`${r.name}-${i}`} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate">{r.name}</p>
                        <p className="text-xs text-muted">
                          {r.category_name} · última em {shortDate(r.last_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tabular">{money(r.monthly_amount)}/mês</p>
                        <p className="text-xs text-muted tabular">{money(r.annual_amount)}/ano</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {data.commitments.some((c) => c.amount > 0) && (
            <Card>
              <CardTitle hint="compras parceladas já feitas">Compromissos futuros</CardTitle>
              <CommitmentsChart data={data.commitments} />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function delta(current: number, previous: number, label: string, lowerIsBetter: boolean) {
  if (!previous) return `sem dados do ${label}`;
  const change = (current - previous) / previous;
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "=";
  const good = lowerIsBetter ? change <= 0 : change >= 0;
  return (
    <span className={good ? "text-positive" : "text-negative"}>
      {arrow} {percent(Math.abs(change))} vs {label}
    </span>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  tone?: "positive" | "negative";
}) {
  return (
    <Card className="p-3.5">
      <p className="text-xs text-muted">{label}</p>
      {/* Número de destaque com dígitos proporcionais (não tabular) */}
      <p
        className={cx(
          "mt-1 text-xl font-semibold tracking-tight",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </Card>
  );
}

function HealthStat({ health }: { health: Summary["health"] }) {
  const level = health.score >= 70 ? "Boa" : health.score >= 40 ? "Atenção" : "Crítica";
  const icon = health.score >= 70 ? "●" : health.score >= 40 ? "▲" : "■";
  const tone =
    health.score >= 70 ? "text-positive" : health.score >= 40 ? "text-warning" : "text-negative";
  return (
    <Card className="p-3.5">
      <p className="text-xs text-muted">Saúde financeira</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">
        {health.score}
        <span className="text-sm font-normal text-muted">/100</span>
      </p>
      <p className="mt-0.5 text-xs">
        <span className={tone}>
          {icon} {level}
        </span>
        <span className="text-muted" title="Poupança (até 40) + reserva (até 30) + gastos fixos (até 30)">
          {" "}
          · {health.savings_points}+{health.reserve_points}+{health.commitment_points}
        </span>
      </p>
    </Card>
  );
}

function CashflowCard({ data }: { data: CashflowPoint[] }) {
  const [table, setTable] = useState(false);
  return (
    <Card>
      <CardTitle
        hint={
          <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => setTable(!table)}>
            {table ? "Ver gráfico" : "Ver tabela"}
          </Button>
        }
      >
        Receitas e despesas — últimos 12 meses
      </CardTitle>
      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-normal">Mês</th>
                <th className="py-1 text-right font-normal">Receitas</th>
                <th className="py-1 text-right font-normal">Despesas</th>
                <th className="py-1 text-right font-normal">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular">
              {data.map((d) => (
                <tr key={d.month}>
                  <td className="py-1.5">{monthLabel(d.month)}</td>
                  <td className="py-1.5 text-right">{money(d.income)}</td>
                  <td className="py-1.5 text-right">{money(d.expense)}</td>
                  <td className={cx("py-1.5 text-right", d.net < 0 && "text-negative")}>
                    {money(d.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="mb-2">
            <Legend series={CASHFLOW_SERIES} shape="rect" />
          </div>
          <CashflowChart data={data} />
        </>
      )}
    </Card>
  );
}

function CategoriesCard({ rows }: { rows: CategoryRow[] }) {
  const visible = rows.filter((r) => r.spent > 0 || r.budget);
  const max = Math.max(1, ...visible.map((r) => Math.max(r.spent, r.budget ?? 0)));
  return (
    <Card>
      <CardTitle hint="vs média dos 3 meses anteriores">Gastos por categoria</CardTitle>
      {visible.length === 0 ? (
        <Empty>Sem gastos neste mês.</Empty>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => {
            const over = r.budget !== null && r.spent > r.budget;
            return (
              <li key={r.category_id ?? "none"} className="text-sm">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate">{r.category_name}</span>
                  <span className="shrink-0 tabular">
                    {money(r.spent)}
                    {r.budget !== null && (
                      <span className="text-xs text-muted"> / {money(r.budget)}</span>
                    )}
                  </span>
                </div>
                <div
                  className="relative h-2 rounded-full bg-surface-2"
                  title={`${r.category_name}: ${money(r.spent)} (média ${money(r.average)})`}
                >
                  <div
                    className="h-2 rounded-full bg-series-1"
                    style={{ width: `${(Math.min(r.spent, max) / max) * 100}%` }}
                  />
                  {r.average > 0 && (
                    // Marca da média: referência discreta sobre a barra
                    <div
                      className="absolute -top-0.5 h-3 w-0.5 rounded bg-foreground/60"
                      style={{ left: `${Math.min(r.average / max, 1) * 100}%` }}
                      aria-hidden
                    />
                  )}
                </div>
                {(r.anomaly || over) && (
                  <p className="mt-1 text-xs">
                    {over && <span className="text-negative">■ Estourou o orçamento </span>}
                    {r.anomaly && r.change !== null && (
                      <span className="text-warning">
                        ▲ {percent(r.change)} acima da média ({money(r.average)})
                      </span>
                    )}
                    {r.anomaly && r.change === null && (
                      <span className="text-warning">▲ gasto novo nesta categoria</span>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">O traço vertical marca a média dos meses anteriores.</p>
    </Card>
  );
}

function RankList({ items }: { items: { label: string; sub: string; value: number }[] }) {
  if (items.length === 0) return <Empty>Sem gastos neste mês.</Empty>;
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5 text-sm">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate">
              {i.label} <span className="text-xs text-muted">· {i.sub}</span>
            </span>
            <span className="shrink-0 tabular">{money(i.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2">
            <div
              className="h-1.5 rounded-full bg-series-1"
              style={{ width: `${(i.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
