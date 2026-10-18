"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cx } from "./ui";

/**
 * Botão (i) que abre uma explicação curta ao lado. Clique abre e fecha; clicar fora ou Esc
 * fecha. `align="end"` abre para a esquerda, para ícones encostados na borda direita.
 */
export function InfoTip({
  label,
  children,
  align = "start",
}: {
  label: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={root} className={cx("relative inline-flex", open && "z-30")}>
      <button
        type="button"
        aria-label={`Como funciona: ${label}`}
        title="Como funciona"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cx(
          "grid size-7 place-items-center rounded-full text-muted [&_svg]:size-4",
          "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
          "hover:bg-surface-2 hover:text-foreground",
          open && "bg-surface-2 text-foreground",
        )}
      >
        <Info strokeWidth={2.2} />
      </button>
      {open && (
        <div
          id={id}
          role="note"
          className={cx(
            "absolute top-full mt-1.5 grid w-[min(21rem,calc(100vw-3rem))] gap-2 rounded-control border border-border bg-surface p-4",
            "text-left text-[13px] leading-relaxed font-normal tracking-normal text-foreground normal-case",
            "shadow-[0_12px_32px_-8px_rgb(0_0_0/0.25)]",
            "[&_strong]:font-semibold [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1 [&_ul]:pl-4",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">{label}</p>
          {children}
        </div>
      )}
    </span>
  );
}
