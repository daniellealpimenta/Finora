import { api, type Connection } from "./api";

// Banco que não manda transação nova há mais que isto entra no aviso de dados parados
// (revisão de design de 2026-11-06). 10 dias: conta pouco usada não vira alarme falso
export const STALE_DAYS = 10;

export type StaleBank = { bank: string; since: string; days: number };

function daysSince(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const then = new Date(y, m - 1, d).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}

/** Bancos cuja transação mais recente (de todas as contas dele) é mais velha que STALE_DAYS. */
export function staleBanks(connections: Connection[]): StaleBank[] {
  const newest = new Map<string, string>();
  for (const c of connections)
    for (const a of c.accounts) {
      if (!a.last_transaction_date) continue;
      const bank = a.bank ?? c.institution_name;
      const seen = newest.get(bank);
      if (!seen || a.last_transaction_date > seen) newest.set(bank, a.last_transaction_date);
    }
  return [...newest]
    .map(([bank, since]) => ({ bank, since, days: daysSince(since) }))
    .filter((b) => b.days > STALE_DAYS)
    .sort((x, y) => y.days - x.days);
}

/** Dias desde a transação mais recente de uma conta, ou null se ela nunca recebeu nenhuma. */
export function accountQuietDays(lastTransaction: string | null | undefined) {
  return lastTransaction ? daysSince(lastTransaction) : null;
}

// Uma busca só para o aviso do painel e o menu do avatar (antes cada um buscava a sua)
let cached: Promise<StaleBank[]> | null = null;

export function loadStaleBanks(): Promise<StaleBank[]> {
  cached ??= api<Connection[]>("/connections")
    .then(staleBanks)
    .catch(() => {
      cached = null;
      return [];
    });
  return cached;
}

/** Depois de sincronizar: a próxima leitura busca de novo. */
export function forgetStaleBanks() {
  cached = null;
}
