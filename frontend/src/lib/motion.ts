"use client";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { RefObject } from "react";

// Tokens de movimento dos momentos GSAP (tabela "Movimento" em MASTER.md)
gsap.registerPlugin(useGSAP);

export const REDUCED = "(prefers-reduced-motion: reduce)";
export const FULL = "(prefers-reduced-motion: no-preference)";

export const motion = {
  enter: { y: 12, duration: 0.5, ease: "power3.out", stagger: 0.06 },
  count: { duration: 0.9, ease: "power2.out" },
  ring: { duration: 1, ease: "power2.out" },
  pop: { duration: 0.4, ease: "back.out(2)" },
  shine: { duration: 0.7, ease: "power2.inOut" },
  fill: { duration: 0.6, ease: "power3.out", stagger: 0.05 },
  monthOut: { x: 24, duration: 0.16, ease: "power2.in" },
  monthIn: { x: 24, duration: 0.36, ease: "power3.out" },
  wiggle: { duration: 0.45, rotation: [0, -12, 9, -4, 0], scale: 1.1 },
  dial: { rotation: -120, duration: 0.45, ease: "power3.inOut" },
  spin: { duration: 1.2 },
  toastIn: { y: 24, duration: 0.4, ease: "back.out(1.6)" },
  toastOut: { y: 12, duration: 0.2, ease: "power2.in" },
  theme: { duration: 0.4, ease: "back.out(1.4)" },
  dialogIn: { scale: 0.96, duration: 0.24, ease: "power3.out" },
  dialogOut: { scale: 0.96, duration: 0.15, ease: "power2.in" },
} as const;

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(REDUCED).matches;
}

/** Ícone balança e cresce um pouco (hover em categoria). Só o ícone, nunca a linha. */
export function wiggle(target: Element | null) {
  if (!target || prefersReducedMotion()) return;
  const { duration, rotation, scale } = motion.wiggle;
  gsap
    .timeline({ overwrite: true })
    .to(target, { keyframes: { rotation: [...rotation] }, duration, ease: "power1.inOut" }, 0)
    .to(target, { scale, duration: 0.2, ease: "back.out(2)" }, 0)
    .to(target, { scale: 1, duration: 0.25, ease: "power2.out" }, 0.25);
}

/**
 * Entrada da página: blocos [data-enter] sobem em cascata e barras [data-fill] enchem.
 * Roda uma vez, quando `ready` vira true (conteúdo carregado).
 */
export function usePageEnter(scope: RefObject<HTMLElement | null>, ready: boolean) {
  useGSAP(
    () => {
      if (!ready) return;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        const q = gsap.utils.selector(scope);
        gsap
          .timeline()
          .from(q("[data-enter]"), {
            y: motion.enter.y,
            autoAlpha: 0,
            duration: motion.enter.duration,
            ease: motion.enter.ease,
            stagger: motion.enter.stagger,
            clearProps: "transform,opacity,visibility",
          })
          .from(q("[data-fill]"), { scaleX: 0, ...motion.fill, stagger: 0.03 }, 0.2);
      });
      return () => mm.revert();
    },
    { scope, dependencies: [ready] },
  );
}

export { gsap, useGSAP };
