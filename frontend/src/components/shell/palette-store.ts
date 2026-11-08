"use client";

import { useSyncExternalStore } from "react";

// Aberto ou fechado: a doca, o menu do avatar e o atalho ⌘K abrem a mesma paleta.
let open = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  open = v;
  listeners.forEach((l) => l());
};

export const openPalette = () => set(true);
export const closePalette = () => set(false);
export const usePaletteOpen = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => false,
  );
