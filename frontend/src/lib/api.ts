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

/** Primeira configuração (tela /bem-vindo). `step` é onde a pessoa parou. */
export type SetupStatus = {
  has_user: boolean;
  pluggy_configured: boolean;
  has_connection: boolean;
  step: string | null;
  done: boolean;
  /** Desde quando a Pluggy recusa o acesso (null = tudo certo) */
  pluggy_alert_since: string | null;
};

export type SetupUser = {
  access_token: string;
  totp_secret: string | null;
  totp_uri: string | null;
};

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

export type WishStatus = "WANTED" | "BOUGHT" | "DROPPED";

/** Desejo da lista (GET /wishlist). Valores em string (Decimal). */
export type WishItem = {
  id: number;
  group_id: number | null;
  name: string;
  url: string | null;
  price: string;
  store: string | null;
  image_url: string | null;
  notes: string | null;
  /** 1 alta, 2 média, 3 baixa */
  priority: 1 | 2 | 3;
  status: WishStatus;
  target_price: string | null;
  bought_at: string | null;
  last_checked_at: string | null;
  /** Preço quando foi adicionado e o menor já visto */
  first_price: string;
  lowest_price: string;
  created_at: string;
};

export type WishGroup = {
  id: number;
  name: string;
  pot_id: number | null;
  pot_name: string | null;
  /** Saldo do cofrinho ligado: quanto já foi guardado para o grupo */
  pot_balance: string | null;
  total: string;
  count: number;
};

export type Wishlist = {
  groups: WishGroup[];
  items: WishItem[];
  /** Só o que ainda é desejado */
  total: string;
  count: number;
  ungrouped_total: string;
  bought_total: string;
};

/** POST /wishlist/preview: o que deu para ler da página do produto */
export type ProductPreview = {
  url: string;
  name: string | null;
  price: string | null;
  currency: string;
  image_url: string | null;
  store: string | null;
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
  /** A Pluggy recusou o acesso (ex.: fim do período de teste). `detail` é o texto da Pluggy. */
  pluggy_alert: { since: string; detail: string } | null;
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

/** GET /pots/{id}/yields: média por dia útil e o rendimento de cada intervalo entre registros */
export type PotYields = {
  average_per_business_day: number;
  tracking_since: string | null;
  daily: { day: string; since: string; days: number; business_days: number; earned: number }[];
};

/** GET /transactions/by-category: gasto por categoria com os filtros da lista */
export type CategorySpend = { category_id: number | null; category_name: string; spent: number; count: number };

// --- assistente (backend/app/api/routes/assistant.py) ------------------------

export type AssistantModel = {
  name: string;
  label: string;
  size_gb: number;
  memory_gb: number;
  note: string;
  installed: boolean;
};

export type PullStatus = {
  model: string | null;
  running: boolean;
  status: string;
  /** Bytes: soma das camadas do modelo */
  total: number;
  completed: number;
  error: string | null;
};

export type AssistantStatus = {
  /** Ollama rodando nesta máquina */
  ollama: boolean;
  models: AssistantModel[];
  active_model: string;
  pull: PullStatus;
};

export type Insight = {
  kind: string;
  severity: "warn" | "info" | "good";
  title: string;
  detail: string;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatEvent =
  | { type: "tool"; name: string; label: string }
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

/** POST /assistant/chat: lê a resposta em SSE e chama `onEvent` a cada pedaço. */
export async function streamChat(
  messages: ChatMessage[],
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}/assistant/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, typeof body.detail === "string" ? body.detail : res.statusText);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (chunk.startsWith("data: ")) onEvent(JSON.parse(chunk.slice(6)) as ChatEvent);
    }
  }
}
