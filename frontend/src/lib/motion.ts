"use client";

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Draggable } from "gsap/Draggable";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import type { RefObject } from "react";

// Tokens de movimento dos momentos GSAP (tabela "Movimento" em MASTER.md)
gsap.registerPlugin(useGSAP, CustomEase, Draggable, DrawSVGPlugin, Flip, InertiaPlugin, MotionPathPlugin, SplitText);

// O segredo do cofre: passa do ponto e volta, como um disco pesado (login)
CustomEase.create("dial", "M0,0 C0.3,0 0.2,1.12 0.6,1.04 0.8,1 0.9,1 1,1");

export const REDUCED = "(prefers-reduced-motion: reduce)";
export const FULL = "(prefers-reduced-motion: no-preference)";

export const motion = {
  // Entradas com mais corpo (2026-10-30): sobem mais e assentam com um leve passo além
  enter: { y: 22, duration: 0.6, ease: "back.out(1.3)", stagger: 0.07 },
  count: { duration: 0.9, ease: "power2.out" },
  ring: { duration: 1, ease: "power2.out" },
  pop: { duration: 0.4, ease: "back.out(2)" },
  shine: { duration: 0.7, ease: "power2.inOut" },
  fill: { duration: 0.6, ease: "power3.out", stagger: 0.05 },
  monthOut: { x: 24, duration: 0.16, ease: "power2.in" },
  monthIn: { x: 24, duration: 0.36, ease: "power3.out" },
  wiggle: { duration: 0.45, rotation: [0, -12, 9, -4, 0], scale: 1.1 },
  flip: { duration: 0.9, ease: "power3.inOut" },
  swap: { duration: 0.45, ease: "back.out(2)" },
  shake: { keyframes: { x: [0, -5, 5, -3, 3, 0] }, duration: 0.45, stagger: 0.08 },
  spin: { duration: 1.2 },
  toastIn: { y: 24, duration: 0.4, ease: "back.out(1.6)" },
  toastOut: { y: 12, duration: 0.2, ease: "power2.in" },
  theme: { duration: 0.4, ease: "back.out(1.4)" },
  dialogIn: { scale: 0.9, y: 16, duration: 0.42, ease: "back.out(1.7)" },
  dialogOut: { scale: 0.94, y: 8, duration: 0.18, ease: "power2.in" },
  /** Troca de página: o conteúdo novo sobe e assenta */
  page: { y: 28, duration: 0.55, ease: "power3.out" },
  /** Elástico curto para peças pequenas (selos, contadores, botões de ícone) */
  spring: { duration: 0.6, ease: "elastic.out(1, 0.5)" },
  /** Carta jogada (Precisava ou vontade) e moeda voando para o pote */
  toss: { duration: 0.55, ease: "power3.in" },
  coinArc: { duration: 0.75, ease: "power1.inOut" },
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
        const tl = gsap
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
        // O que passou do limite treme uma vez, depois que as barras enchem. Só com alvo: tween
        // com keyframes e sem alvo quebra o GSAP ("tl.render is not a function")
        const over = q("[data-over]");
        if (over.length) tl.to(over, motion.shake, 0.9);
      });
      return () => mm.revert();
    },
    { scope, dependencies: [ready] },
  );
}

/** Pulinho elástico de uma peça pequena (contador que mudou, selo, botão). */
export function boing(target: Element | null, scale = 1.18) {
  if (!target || prefersReducedMotion()) return;
  gsap.fromTo(target, { scale }, { scale: 1, ...motion.spring, overwrite: "auto" });
}

export { CustomEase, Draggable, Flip, gsap, SplitText, useGSAP };
