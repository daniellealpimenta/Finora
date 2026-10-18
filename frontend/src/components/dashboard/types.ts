import type { CashflowPoint, DailyPoint } from "@/components/charts";
import type { Category } from "@/lib/api";

// Respostas de /dashboard/* (backend/app/services/analytics.py)
export type Summary = {
  income: number;
  expense: number;
  net: number;
  previous_income: number;
  previous_expense: number;
  savings_rate: number | null;
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
