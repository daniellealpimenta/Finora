import type { CashflowPoint, DailyPoint } from "@/components/charts";
import type { Category } from "@/lib/api";
import type { CycleInfo } from "@/lib/cycle";

// Respostas de /dashboard/* (backend/app/services/analytics.py)
export type Summary = {
  income: number;
  expense: number;
  net: number;
  previous_income: number;
  previous_expense: number;
  savings_rate: number | null;
  cycle: CycleInfo;
  /** A conta do ciclo: começou com + entrou − gastos − faturas − guardado = terminou com */
  flow: CycleFlow;
  previous_result: number;
  projected_expense: number | null;
  liquid_balance: number;
  card_debt: number;
  invested: number;
  available_now: number;
  next_bill_due: string | null;
  next_bill_amount: number | null;
  avg_monthly_expense: number;
  emergency_reserve_months: number | null;
  fixed_monthly: number;
  fixed_commitment: number | null;
  health: { score: number; savings_points: number; reserve_points: number; commitment_points: number };
};
export type CycleFlow = {
  started_with: number;
  income: number;
  spent: number;
  card_bills: number;
  bills: { bank: string; status: string; amount: number; close_date: string | null; due_date: string | null }[];
  saved: number;
  other: number;
  result: number;
  ended_with: number;
  /** Só em ciclos encerrados: o "terminou com" contra o saldo real do fim do ciclo */
  check: { balance: number; unpaid_bills: number; free: number; difference: number } | null;
};
export type CategoryRow = {
  category_id: number | null;
  category_name: string;
  spent: number;
  average: number;
  change: number | null;
  anomaly: boolean;
  budget: number | null;
};
export type Merchant = { name: string; total: number; count: number };
export type Recurring = {
  name: string;
  category_name: string;
  monthly_amount: number;
  annual_amount: number;
  months_seen: number;
  last_date: string;
};
export type Commitment = { month: string; amount: number };

export type Data = {
  month: string;
  summary: Summary;
  cashflow: CashflowPoint[];
  categories: CategoryRow[];
  daily: DailyPoint[];
  merchants: Merchant[];
  recurring: Recurring[];
  commitments: Commitment[];
  catalog: Category[];
};

/** GET /dashboard/forecast: previsão do fim do ciclo atual */
export type Forecast = {
  cycle: CycleInfo;
  days_left: number;
  available_now: number;
  incomes: {
    key: string;
    label: string;
    expected: number;
    received: number;
    remaining: number;
    expected_date: string | null;
    until: string | null;
    ignored: boolean;
    counted: boolean;
  }[];
  income_left: number;
  tithe: { rate: number; base: number; given: number; left: number };
  savings: { goal: number; saved: number; left: number };
  fixed: { name: string; amount: number }[];
  fixed_left: number;
  daily_typical: number;
  variable_left: number;
  /** Total para o dia a dia até o fim do ciclo (daily_allowance = spendable ÷ dias) */
  spendable: number;
  daily_allowance: number | null;
  forecast_end: number;
};

/** GET/PUT /planning */
export type Planning = {
  tithe_rate: number;
  savings_goal: number;
  incomes: Record<string, { until: string | null; ignore: boolean }>;
};
