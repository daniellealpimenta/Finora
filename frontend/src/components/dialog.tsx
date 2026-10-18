"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { gsap, motion, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { IconButton } from "./ui";

/**
 * Diálogo com entrada e saída animadas. Todo fechamento passa por `close(after)`, que roda a
 * saída e só então avisa o pai, para o diálogo nunca sumir de uma vez.
 */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: (close: (after?: () => void) => void) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const titleId = useId();

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(veil.current, { autoAlpha: 0, duration: motion.dialogIn.duration });
      gsap.from(panel.current, { ...motion.dialogIn, autoAlpha: 0 });
    },
    { scope: root },
  );

  const { contextSafe } = useGSAP({ scope: root });
  const close = contextSafe((after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    const done = () => (after ?? onClose)();
    if (prefersReducedMotion()) return done();
    gsap.to(veil.current, { autoAlpha: 0, duration: motion.dialogOut.duration });
    gsap.to(panel.current, { ...motion.dialogOut, autoAlpha: 0, onComplete: done });
  });

  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // Esc fecha; o foco entra no diálogo e volta para onde estava ao sair
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input, select, button:not([data-dismiss])")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div ref={root} className="fixed inset-0 z-50 grid place-items-center px-4">
      <div ref={veil} className="absolute inset-0 bg-black/45" onClick={() => close()} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-card border border-card-edge bg-surface p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          <IconButton label="Fechar" data-dismiss onClick={() => close()} className="-mt-1.5 -mr-2">
            <X />
          </IconButton>
        </div>
        {children(close)}
      </div>
    </div>
  );
}
