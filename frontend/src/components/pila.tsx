"use client";

import { useRef, type ReactNode } from "react";

import { FULL, gsap, useGSAP } from "@/lib/motion";
import { cx } from "./ui";

/**
 * Pila, o porquinho de latão (MASTER.md, "Mascote"). Aparece só quando há algo a dizer:
 * login, estado vazio, conquista, sincronização e erro. Nunca em todo card.
 */
export type PilaMood = "happy" | "neutral" | "worried" | "sleep";

const INK = "var(--pila-ink)";
const LINE = "var(--pila-line)";

function Face({ mood }: { mood: PilaMood }) {
  switch (mood) {
    case "happy":
      return (
        <>
          <path d="M42 55q4-5 8 0M56 53q4-5 8 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="49" cy="66" r="3.5" fill="var(--pila-ear)" opacity="0.7" />
          <path d="M27 84q5 5 10 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
    case "worried":
      return (
        <>
          <path d="M40 45l8 3M66 43l-8 3" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <circle cx="46" cy="55" r="3" fill={INK} />
          <circle cx="60" cy="53" r="3" fill={INK} />
          <path d="M84 40q-4 7 0 9q4-2 0-9z" fill="var(--cat-home)" />
          <path d="M27 86q5-4 10 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      );
    case "sleep":
      return (
        <>
          <path d="M42 55h8M56 53h8" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M96 12h8l-8 9h8" stroke="var(--muted)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    default:
      return (
        <>
          <circle cx="46" cy="54" r="3.4" fill={INK} />
          <circle cx="60" cy="52" r="3.4" fill={INK} />
          <path d="M28 84h8" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </>
      );
  }
}

export function Pila({
  mood = "neutral",
  size = 120,
  coin = false,
  className,
  label,
}: {
  mood?: PilaMood;
  size?: number;
  /** Uma moeda cai pela fenda, uma vez (cofrinho cresceu, mês fechou no azul). */
  coin?: boolean;
  className?: string;
  /** Texto para leitor de tela; sem ele o Pila é decorativo. */
  label?: string;
}) {
  const root = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        const q = gsap.utils.selector(root);
        const tl = gsap.timeline();
        tl.from(root.current, { y: 8, autoAlpha: 0, duration: 0.45, ease: "power3.out" });
        if (coin) {
          tl.fromTo(
            q("[data-coin]"),
            { y: -26, autoAlpha: 0 },
            { y: 14, autoAlpha: 1, duration: 0.5, ease: "power2.in" },
            0.25,
          ).to(q("[data-coin]"), { autoAlpha: 0, duration: 0.12 });
        }
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [mood, coin], revertOnUpdate: true },
  );

  return (
    <svg
      ref={root}
      width={size}
      height={(size * 120) / 126}
      viewBox="0 0 126 120"
      className={cx("shrink-0 overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <ellipse cx="64" cy="111" rx="40" ry="4.5" fill="#000" opacity="0.18" />
      <rect x="34" y="88" width="11" height="18" rx="4" fill="var(--pila-leg)" />
      <rect x="50" y="90" width="11" height="17" rx="4" fill="var(--pila-leg)" opacity="0.85" />
      <rect x="72" y="90" width="11" height="17" rx="4" fill="var(--pila-leg)" opacity="0.85" />
      <rect x="86" y="88" width="11" height="18" rx="4" fill="var(--pila-leg)" />
      <path d="M104 62q12-3 8-13q-4-7-9 1" stroke={LINE} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M40 40l-5-17l17 9z" fill="var(--pila-ear)" stroke={LINE} strokeWidth="3" strokeLinejoin="round" />
      <path d="M78 34l7-16l8 17z" fill="var(--pila-ear)" stroke={LINE} strokeWidth="3" strokeLinejoin="round" />
      <g data-coin style={{ visibility: coin ? undefined : "hidden" }}>
        <circle cx="67" cy="22" r="8" fill="var(--coin)" stroke="var(--coin-line)" strokeWidth="2.5" />
        <path d="M67 17.5v9" stroke="var(--coin-line)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <ellipse cx="66" cy="64" rx="43" ry="32" fill="var(--pila-body)" stroke={LINE} strokeWidth="3" />
      <rect x="56" y="34" width="22" height="4.5" rx="2.2" fill={LINE} />
      <ellipse cx="31" cy="70" rx="12" ry="9.5" fill="var(--pila-light)" stroke={LINE} strokeWidth="3" />
      <ellipse cx="27" cy="70" rx="1.8" ry="2.8" fill={LINE} />
      <ellipse cx="35" cy="70" rx="1.8" ry="2.8" fill={LINE} />
      <Face mood={mood} />
    </svg>
  );
}

/** Pila com um balão de fala. */
export function PilaSays({
  mood,
  children,
  size = 96,
  coin,
  side = "right",
}: {
  mood: PilaMood;
  children: ReactNode;
  size?: number;
  coin?: boolean;
  side?: "left" | "right";
}) {
  return (
    <div className={cx("flex items-end gap-3", side === "left" && "flex-row-reverse")}>
      <Pila mood={mood} size={size} coin={coin} />
      <p
        className={cx(
          "mb-6 max-w-56 rounded-card bg-surface-2 px-3.5 py-2.5 text-sm leading-snug",
          side === "right" ? "rounded-bl-[4px]" : "rounded-br-[4px]",
        )}
      >
        {children}
      </p>
    </div>
  );
}
