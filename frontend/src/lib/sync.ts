"use client";

import { api, type SyncStatus } from "./api";
import { notify, setSyncing } from "./signals";
import { forgetStaleBanks } from "./stale";

/** O Pila conta o que o sync trouxe; sem nada novo, só confirma. Devolve o erro, se houver. */
export function announceSync(status: SyncStatus): string | null {
  const r = status.last_result;
  if (status.last_error) return `A sincronização falhou: ${status.last_error}`;
  if (!r) return null;
  if (r.created > 0)
    notify(r.created === 1 ? "Chegou 1 transação nova." : `Chegaram ${r.created} transações novas.`, "ok", {
      mood: "celebrate",
      coin: true,
    });
  else notify("Tudo em dia, nada novo nos bancos.", "ok", { mood: "happy" });
  return r.errors.length ? `Alguns bancos tiveram erro: ${r.errors.join("; ")}` : null;
}

let polling = false;

/**
 * Sincroniza de qualquer tela (menu do avatar e ⌘K): dispara, acompanha a cada 2s e avisa no
 * fim. A moeda da marca gira enquanto isso (setSyncing).
 */
export async function syncNow() {
  if (polling) return;
  polling = true;
  setSyncing(true);
  try {
    let status = await api<SyncStatus>("/sync", { method: "POST" });
    while (status.running) {
      await new Promise((r) => setTimeout(r, 2000));
      status = await api<SyncStatus>("/sync/status");
    }
    const error = announceSync(status);
    if (error) notify(error, "bad", { mood: "worried" });
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "bad");
  } finally {
    forgetStaleBanks();
    polling = false;
    setSyncing(false);
  }
}
