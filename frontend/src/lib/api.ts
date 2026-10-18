const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Token em sessionStorage (some ao fechar a aba). Tudo roda local.
const TOKEN_KEY = "mf_token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage indisponível */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // FormData define o próprio Content-Type (multipart com boundary)
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : res.statusText;
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function qs(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export async function login(email: string, password: string, totpCode?: string) {
  const { access_token } = await api<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, totp_code: totpCode || null }),
  });
  setToken(access_token);
}

// --- tipos da API ----------------------------------------------------------

export type Me = { id: number; email: string };

export type AccountType = "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "INVESTMENT" | "LOAN" | "OTHER";
export type CategoryKind = "EXPENSE" | "INCOME" | "TRANSFER";

export type Account = {
  id: number;
  connection_id: number | null;
  name: string;
  type: AccountType;
  balance: string;
  credit_limit: string | null;
  currency: string;
  bill_due_date: string | null;
  bill_close_date: string | null;
  /** Cartão: dia de fechamento escolhido pelo usuário (null = estimado pelas faturas) */
  closing_day: number | null;
};

/** Aplicação (caixinha, CDB...) que chega da Pluggy (GET /investments). */
export type Investment = {
  id: number;
  connection_id: number;
  institution_name: string;
  name: string;
  type: string;
  subtype: string | null;
  balance: string;
  currency: string;
  rate: string | null;
  rate_type: string | null;
  amount_original: string | null;
  purchase_date: string | null;
  due_date: string | null;
  pot_id: number | null;
};

/** Cofrinho montado pelo usuário, juntando aplicações (GET /pots). */
export type SavingsPot = {
  id: number;
  name: string;
  goal_amount: string | null;
  balance: string;
  /** Soma do valor aplicado; earned = balance - applied */
  applied: string;
  earned: string;
  investments: number;
};

export type BillStatus = "open" | "closed" | "overdue" | "paid";

/** Fatura de cartão: a aberta (calculada) ou uma fechada da Pluggy. */
export type CardBill = {
  id: string;
  status: BillStatus;
  /** Mês do vencimento ("2026-11" = fatura de novembro) */
  competence: string;
  due_date: string | null;
  /** Fechamento estimado pelo último lançamento; null quando não dá para saber */
  close_date: string | null;
  amount: number;
  minimum_payment: number | null;
  paid_at: string | null;
  purchases: number | null;
};

/** Cartão de crédito com limite e faturas (GET /cards). */
export type CreditCardInfo = {
  account_id: number;
  name: string;
  bank: string;
  brand: string | null;
  level: string | null;
  number: string | null;
  credit_limit: number | null;
  available_limit: number | null;
  used: number;
  installments_used: number | null;
  closing_day: number | null;
  /** Fechamento estimado pelas faturas (vale quando closing_day é null) */
  estimated_closing_day: number | null;
  /** Cartão principal: o fechamento dele define os ciclos */
  is_cycle_reference: boolean;
  /** Mais recente primeiro: a aberta, depois as fechadas */
  bills: CardBill[];
};

/** Compra parcelada em andamento (GET /dashboard/installments). */
export type Installment = {
  name: string;
  account_name: string;
  category_id: number | null;
  category_name: string;
  installment_amount: number;
  total: number;
  paid: number;
  remaining: number;
  remaining_amount: number;
  first_month: string;
  last_month: string;
};

export type Connection = {
  id: number;
  institution_name: string;
  institution_logo_url: string | null;
  status: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  accounts: Account[];
};

export type SyncStatus = {
  running: boolean;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_error: string | null;
  last_result: {
    connections: number;
    accounts: number;
    created: number;
    updated: number;
    deleted: number;
    errors: string[];
  } | null;
};

export type Category = { id: number; key: string | null; name: string; kind: CategoryKind };

export type Transaction = {
  id: number;
  date: string;
  amount: string;
  description: string;
  merchant: string | null;
  account_id: number;
  account_name: string;
  category_id: number | null;
  category_name: string | null;
  category_kind: CategoryKind | null;
  status: "POSTED" | "PENDING";
  installment_number: number | null;
  installment_total: number | null;
  user_categorized: boolean;
};

export type TransactionPage = {
  items: Transaction[];
  total: number;
  income: string;
  expense: string;
};
