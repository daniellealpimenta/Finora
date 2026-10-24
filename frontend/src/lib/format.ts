const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** Valor ausente ou inválido (campo que a API ainda não mandou) vira "—", nunca "NaN". */
const finite = (v: string | number | null | undefined) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};

export const money = (v: string | number | null | undefined) => {
  const n = finite(v);
  return n === null ? "—" : brl.format(n);
};
export const moneyCompact = (v: string | number | null | undefined) => {
  const n = finite(v);
  return n === null ? "—" : brlCompact.format(n);
};
/** "1.234,56" ou "1234.56" -> número; vazio -> null; inválido -> NaN. */
export function parseMoney(raw: string): number | null {
  const clean = raw.replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return clean === "" ? null : Number(clean);
}

export const percent = (v: number) => (Number.isFinite(v) ? pct.format(v) : "—");

const pctFine = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Rendimento com sinal e % sobre o aplicado: "+R$ 209,65 (1,09%)" */
export function earnedText(earned: string | number, applied: string | number) {
  const e = Number(earned);
  const a = Number(applied);
  const share = a > 0 ? ` (${pctFine.format(Math.abs(e) / a)})` : "";
  return `${e < 0 ? "−" : "+"}${brl.format(Math.abs(e))}${share}`;
}

/** "2026-10-05" -> "05/10" (sem conversão de fuso: a data já é local) */
export function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function dateTime(iso: string | null) {
  if (!iso) return "nunca";
  // A API devolve UTC sem sufixo quando vem do SQLite
  const value = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: style,
    year: style === "long" ? "numeric" : "2-digit",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CREDIT_CARD: "Cartão de crédito",
  INVESTMENT: "Investimentos",
  LOAN: "Empréstimo",
  OTHER: "Outra",
};
