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
  /** Avisos para ler o resultado do ciclo (analytics.cycle_notes) */
  notes: CycleNote[];
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
  /** Soma das parcelas em andamento (compromisso de todo ciclo, como os fixos) */
  installments_monthly: number;
  /** (fixos + parcelas) ÷ renda média */
  fixed_commitment: number | null;
  health: {
    score: number;
    /** Taxa de poupança dos 3 últimos ciclos fechados, a usada no score */
    savings_rate: number | null;
    savings_points: number;
    reserve_points: number;
    commitment_points: number;
  };
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
export type CycleNote =
  | {
      /** Algo de todo ciclo caiu no ciclo seguinte (shifted_out) ou duas vezes neste (doubled) */
      kind: "shifted_out" | "doubled";
      income: boolean;
      label: string;
      category_name: string;
      amount: number;
      dates: string[];
    }
  | { kind: "bills_after"; amount: number; bills: { bank: string; amount: number; due_date: string }[] }
  | { kind: "withdrew"; amount: number };
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
  /** O que entra no ciclo: o que já entrou + o previsto (base da meta em %) */
  cycle_income: number;
  tithe: { rate: number; base: number; given: number; left: number };
  /** Meta de guardar no ciclo: % do que entra ou valor fixo; `saved` = já guardado no ciclo */
  savings: {
    mode: "rate" | "amount";
    rate: number;
    goal: number;
    saved: number;
    left: number;
    /** Quanto foi guardado nos 3 últimos ciclos fechados (referência) */
    history_rate: number | null;
  };
  fixed: { name: string; amount: number; expected_date: string | null }[];
  fixed_left: number;
  /** Parcelas que ainda vão entrar na fatura deste ciclo */
  installments: { name: string; amount: number }[];
  installments_left: number;
  daily_typical: number;
  variable_left: number;
  /** Total para o dia a dia até o fim do ciclo, já cumprindo a meta (daily_allowance = ÷ dias) */
  spendable: number;
  daily_allowance: number | null;
  /** No seu ritmo: o que sobra além da meta (negativo = o ritmo come parte da meta) */
  forecast_end: number;
  /** O dinheiro de agora até a próxima entrada, já tirando as contas que vencem antes dela */
  until_income: { label: string; date: string; days: number; fixed_before: number; free: number; daily: number } | null;
  /** Saúde financeira ao lado da conta (services/affordability.health_check) */
  health: HealthCheck;
  /** Folga média do mês além da meta de guardar */
  monthly_room: number;
};

export type HealthCheck = {
  status: "ok" | "warn" | "bad";
  score: number;
  reserve_months: number | null;
  reserve_status: "ok" | "warn" | "bad";
  commitment: number | null;
  commitment_status: "ok" | "warn" | "bad";
  /** Frases prontas do que fazer, na ordem de importância */
  tips: string[];
};

/** GET/PUT /planning */
export type Planning = {
  tithe_rate: number;
  savings_mode: "rate" | "amount";
  savings_rate: number;
  savings_goal: number;
  incomes: Record<string, { until: string | null; ignore: boolean }>;
};
