"use client";

import { useSyncExternalStore } from "react";

import type { PilaMood } from "@/components/pila";
import { playCoin } from "./sound";

// Dois estados globais pequenos, sem biblioteca: "sincronizando" (o disco do cofre gira no
// menu enquanto a tela de Contas sincroniza) e a fila de avisos (toasts).

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const syncing = store(false);

export const setSyncing = (v: boolean) => syncing.set(v);
export const useSyncing = () => useSyncExternalStore(syncing.subscribe, syncing.get, () => false);

/** `mood` troca o ícone pelo Pila com aquele humor; `coin` toca o "tlim" (se o som estiver ligado). */
export type Toast = { id: number; message: string; tone: "ok" | "bad"; mood?: PilaMood };

const toasts = store<Toast[]>([]);
let nextId = 1;
const NO_TOASTS: Toast[] = [];

export function notify(
  message: string,
  tone: Toast["tone"] = "ok",
  extra: { mood?: PilaMood; coin?: boolean } = {},
) {
  toasts.set([...toasts.get(), { id: nextId++, message, tone, mood: extra.mood }]);
  if (extra.coin) playCoin();
}
export const dismissToast = (id: number) => toasts.set(toasts.get().filter((t) => t.id !== id));
export const useToasts = () => useSyncExternalStore(toasts.subscribe, toasts.get, () => NO_TOASTS);
