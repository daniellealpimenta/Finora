"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { FULL, gsap, useGSAP } from "@/lib/motion";
import { cx } from "./ui";

/**
 * Pila, o porquinho (MASTER.md, "Mascote"). De frente, formas chapadas e sem contorno, para a
 * expressão ler bem até em 28px. Aparece só quando há algo a dizer: login, estado vazio,
 * conquista, sincronização e erro. Nunca em todo card.
 */
export type PilaMood = "happy" | "neutral" | "worried" | "sleep" | "shy" | "celebrate";

const INK = "var(--pila-ink)";
const LINE = "var(--pila-line)";

function Eyes({ mood }: { mood: PilaMood }) {
  switch (mood) {
    case "happy":
    case "celebrate":
      return <path d="M37 58q6-8 12 0M71 58q6-8 12 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />;
    case "sleep":
    case "shy":
      return <path d="M37 56q6 6 12 0M71 56q6 6 12 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
    default: {
      const r = mood === "worried" ? 4.6 : 5.6;
      return (
        <>
          {mood === "worried" && (
            <path d="M35 44l12 4M85 44l-12 4" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          )}
          {/* data-eyes pisca; data-pupils segue o ponteiro (só com `alive`) */}
          <g data-eyes>
            <g data-pupils>
              <ellipse cx="43" cy="56" rx={r} ry={r + 1.2} fill={INK} />
              <circle cx="45" cy="53.5" r="1.9" fill="#fff" />
              <ellipse cx="77" cy="56" rx={r} ry={r + 1.2} fill={INK} />
              <circle cx="79" cy="53.5" r="1.9" fill="#fff" />
            </g>
          </g>
        </>
      );
    }
  }
}

function Mouth({ mood }: { mood: PilaMood }) {
  switch (mood) {
    case "happy":
      return (
        <>
          <path d="M48 89q12 14 24 0z" fill={INK} />
          <path d="M53 93q7 5 14 0q-7-3-14 0z" fill="var(--pila-blush)" />
        </>
      );
    case "celebrate":
      return (
        <>
          <path d="M45 87q15 20 30 0z" fill={INK} />
          <path d="M51 94q9 6 18 0q-9-4-18 0z" fill="var(--pila-blush)" />
          <path d="M14 30l3-7l3 7l7 3l-7 3l-3 7l-3-7l-7-3zM100 12l2-5l2 5l5 2l-5 2l-2 5l-2-5l-5-2z" fill="var(--coin)" />
        </>
      );
    case "worried":
      return (
        <>
          <path d="M50 93q5-5 10 0t10 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M95 36q-5 8 0 11q5-3 0-11z" fill="var(--cat-home)" />
        </>
      );
    case "sleep":
      return (
        <>
          <ellipse cx="60" cy="92" rx="3.5" ry="3" fill={INK} />
          <path d="M92 20h9l-9 10h9" stroke="var(--muted)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case "shy":
      return <path d="M53 90q7 5 14 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
    default:
      return <path d="M50 89q10 8 20 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  }
}

/** Pisca de vez em quando e segue o ponteiro com os olhos. A única animação em loop do app
 * (MASTER.md): curta, rara, e desligada com "reduzir movimento". */
function useAlive(root: React.RefObject<SVGSVGElement | null>, enabled: boolean, mood: PilaMood) {
  useEffect(() => {
    const svg = root.current;
    if (!enabled || !svg || !window.matchMedia(FULL).matches) return;
    let timer = 0;
    const blink = () => {
      const eyes = svg.querySelector<SVGGElement>("[data-eyes]");
      if (eyes)
        gsap.fromTo(eyes, { scaleY: 1 }, { scaleY: 0.1, svgOrigin: "60 56", duration: 0.09, yoyo: true, repeat: 1, ease: "power1.inOut" });
      timer = window.setTimeout(blink, 2600 + Math.random() * 3600);
    };
    timer = window.setTimeout(blink, 1200 + Math.random() * 2000);

    const look = (e: PointerEvent) => {
      const pupils = svg.querySelector<SVGGElement>("[data-pupils]");
      if (!pupils) return;
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.45);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 300) * 3;
      gsap.to(pupils, { x: (dx / d) * k, y: (dy / d) * k, duration: 0.25, ease: "power2.out", overwrite: true });
    };
    window.addEventListener("pointermove", look);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", look);
    };
  }, [root, enabled, mood]);
}

export function Pila({
  mood = "neutral",
  size = 120,
  coin = false,
  alive = false,
  className,
  label,
}: {
  mood?: PilaMood;
  size?: number;
  /** Uma moeda cai pela fenda, uma vez (cofrinho cresceu, mês fechou no azul). */
  coin?: boolean;
  /** Pisca e segue o ponteiro com os olhos. Só onde ele é o centro da tela (login, vazio). */
  alive?: boolean;
  className?: string;
  /** Texto para leitor de tela; sem ele o Pila é decorativo. */
  label?: string;
}) {
  const root = useRef<SVGSVGElement>(null);
  useAlive(root, alive, mood);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        const q = gsap.utils.selector(root);
        const tl = gsap.timeline();
        tl.from(root.current, { y: 8, autoAlpha: 0, duration: 0.45, ease: "power3.out" });
        if (mood === "celebrate") tl.from(q("[data-body]"), { y: -6, duration: 0.5, ease: "back.out(3)" }, 0.1);
        if (coin) {
          tl.fromTo(
            q("[data-coin]"),
            { y: -28, autoAlpha: 0 },
            { y: 12, autoAlpha: 1, duration: 0.5, ease: "power2.in" },
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
      height={size}
      viewBox="0 0 120 120"
      className={cx("shrink-0 overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <ellipse cx="60" cy="112" rx="32" ry="4.5" fill="#000" opacity="0.16" />
      <g data-coin style={{ visibility: coin ? undefined : "hidden" }}>
        <circle cx="60" cy="14" r="8" fill="var(--coin)" stroke="var(--coin-line)" strokeWidth="2.5" />
        <path d="M60 9.5v9" stroke="var(--coin-line)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g data-body>
        <rect x="34" y="90" width="17" height="19" rx="7" fill="var(--pila-ear)" />
        <rect x="69" y="90" width="17" height="19" rx="7" fill="var(--pila-ear)" />
        <path d="M26 42Q19 26 25 19Q31 14 52 30z" fill="var(--pila-ear)" />
        <path d="M94 42Q101 26 95 19Q89 14 68 30z" fill="var(--pila-ear)" />
        <ellipse cx="60" cy="63" rx="42" ry="39" fill="var(--pila-body)" />
        <ellipse cx="44" cy="40" rx="15" ry="8" fill="var(--pila-light)" opacity="0.55" transform="rotate(-18 44 40)" />
        <rect x="49" y="27" width="22" height="5" rx="2.5" fill={LINE} />
        <ellipse cx="30" cy="74" rx="7" ry="4.5" fill="var(--pila-blush)" opacity={mood === "shy" ? 0.9 : 0.5} />
        <ellipse cx="90" cy="74" rx="7" ry="4.5" fill="var(--pila-blush)" opacity={mood === "shy" ? 0.9 : 0.5} />
        <Eyes mood={mood} />
        <ellipse cx="60" cy="73" rx="15" ry="11" fill="var(--pila-light)" />
        <ellipse cx="54.5" cy="73" rx="2.6" ry="3.8" fill={LINE} />
        <ellipse cx="65.5" cy="73" rx="2.6" ry="3.8" fill={LINE} />
        <Mouth mood={mood} />
      </g>
    </svg>
  );
}

/** Pila com um balão de fala. */
export function PilaSays({
  mood,
  children,
  size = 96,
  coin,
  alive,
  side = "right",
}: {
  mood: PilaMood;
  children: ReactNode;
  size?: number;
  coin?: boolean;
  alive?: boolean;
  side?: "left" | "right";
}) {
  return (
    <div className={cx("flex items-end gap-3", side === "left" && "flex-row-reverse")}>
      <Pila mood={mood} size={size} coin={coin} alive={alive} />
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
