"use client";

import { useEffect, useState } from "react";

import { api, qs } from "./api";
import { monthLabel, shortDate } from "./format";

/** Ciclo (GET /dashboard/cycle): do dia escolhido pelo usuário até a véspera dele no mês seguinte,
 * ou, sem escolha, do dia seguinte a um fechamento da fatura até o próximo. */
export type CycleInfo = {
  /** Mês em que o ciclo começa: "2026-09" = ciclo de setembro */
  key: string;
  start: string;
  /** Último dia (inclusive) */
  end: string;
  is_current: boolean;
  current_key: string;
  reference_card: string | null;
  /** Dia em que os ciclos começam, escolhido em Contas (null: segue o fechamento do cartão) */
  start_day: number | null;
};

/** "setembro" (com o ano quando não é o corrente). */
export function cycleName(key: string) {
  const sameYear = key.slice(0, 4) === String(new Date().getFullYear());
  const label = monthLabel(key).toLowerCase();
  return sameYear ? label.split(" de ")[0] : label;
}

/** "09/09 a 08/10" */
export const cycleRange = (c: { start: string; end: string }) => `${shortDate(c.start)} a ${shortDate(c.end)}`;

/**
 * Ciclo escolhido na página. Começa vazio e assume o ciclo atual que o backend calcula (o
 * navegador não sabe quando a fatura fecha); `info` traz início e fim do ciclo escolhido.
 */
export function useCycle() {
  const [key, setKey] = useState<string | null>(null);
  const [info, setInfo] = useState<CycleInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CycleInfo>(`/dashboard/cycle${qs({ month: key })}`)
      .then((i) => {
        setInfo(i);
        setError(null);
        if (!key) setKey(i.key);
      })
      .catch((e) => setError(e.message));
  }, [key]);

  return { key, setKey, info: info?.key === key ? info : null, error };
}
