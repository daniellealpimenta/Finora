"use client";

import { useRef } from "react";

import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { playCoin } from "@/lib/sound";

/**
 * A porta do cofre abrindo depois do login (MASTER.md, "Movimento"). O segredo gira e passa do
 * ponto, os 8 ferrolhos recolhem, a maçaneta vira e a porta se abre em 3D com um clarão de
 * latão. No fim a tela vira o fundo do app e `onOpen` libera a navegação. Sem animação
 * ("reduzir movimento"), libera na hora.
 */
const C = 180;
const BOLTS = Array.from({ length: 8 }, (_, i) => i * 45);
const RIVETS = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
const TICKS = Array.from({ length: 100 }, (_, i) => i);

export function VaultOpening({ onOpen }: { onOpen: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        onOpen();
        return;
      }
      const q = gsap.utils.selector(root);
      const dial = q("[data-dial]");
      gsap
        .timeline({ onComplete: onOpen })
        .from(root.current, { autoAlpha: 0, duration: 0.25 })
        .from(q("[data-door]"), { scale: 0.86, rotation: -20, duration: 0.6, ease: "back.out(1.6)" }, 0)
        .from(q("[data-word]"), { yPercent: 110, stagger: 0.05, duration: 0.6, ease: "power4.out" }, 0.1)
        .to(dial, { rotation: "+=620", svgOrigin: `${C} ${C}`, duration: 1.0, ease: "power2.inOut" }, 0.3)
        .to(dial, { rotation: "-=230", svgOrigin: `${C} ${C}`, duration: 0.6, ease: "power2.inOut" })
        .to(dial, { rotation: "+=95", svgOrigin: `${C} ${C}`, duration: 0.45, ease: "dial" })
        .to(q("[data-tick]"), { stroke: "var(--coin)", duration: 0.04, stagger: 0.004 }, "-=0.4")
        .add(() => playCoin())
        .to(q("[data-bolt]"), { x: -38, duration: 0.28, stagger: 0.045, ease: "power3.in" })
        .to(q("[data-handle]"), { rotation: 90, svgOrigin: `${C} ${C}`, duration: 0.55, ease: "power2.inOut" }, "-=0.1")
        .to(q("[data-glow]"), { autoAlpha: 0.8, scale: 1.2, duration: 0.35 }, "<0.25")
        .to(q("[data-door]"), { rotationY: -108, transformOrigin: "0% 50%", duration: 1.0, ease: "power3.inOut" })
        .to(q("[data-title]"), { y: -24, autoAlpha: 0, duration: 0.5, ease: "power2.in" }, "<")
        .to(q("[data-flash]"), { autoAlpha: 1, duration: 0.35, ease: "power2.in" }, "-=0.4")
        .to(q("[data-ground]"), { autoAlpha: 1, duration: 0.3 });
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      role="status"
      aria-label="Abrindo o cofre"
      className="theme-dark fixed inset-0 z-[60] grid place-items-center overflow-hidden bg-background text-foreground"
    >
      <div className="grid justify-items-center gap-8 px-4">
        <div className="relative w-[min(420px,78vw)] [perspective:1400px]">
          <div
            data-glow
            className="invisible absolute inset-[10%] rounded-full bg-[radial-gradient(circle,var(--coin),transparent_65%)]"
          />
          <svg data-door viewBox="0 0 360 360" className="relative block w-full [transform-style:preserve-3d]" aria-hidden>
            <defs>
              <radialGradient id="vault-steel" cx="40%" cy="35%">
                <stop offset="0" stopColor="#3a4652" />
                <stop offset=".6" stopColor="#1d252d" />
                <stop offset="1" stopColor="#11171d" />
              </radialGradient>
              <radialGradient id="vault-brass" cx="35%" cy="30%">
                <stop offset="0" stopColor="#f3d59a" />
                <stop offset=".55" stopColor="var(--coin)" />
                <stop offset="1" stopColor="var(--coin-line)" />
              </radialGradient>
            </defs>
            <circle cx={C} cy={C} r="176" fill="#0e1318" stroke="var(--border)" strokeWidth="2" />
            {BOLTS.map((a) => (
              <g key={a} transform={`rotate(${a} ${C} ${C})`}>
                <rect data-bolt x="300" y={C - 9} width="44" height="18" rx="5" fill="url(#vault-brass)" stroke="var(--coin-line)" strokeWidth="1.5" />
              </g>
            ))}
            <circle cx={C} cy={C} r="150" fill="url(#vault-steel)" stroke="#3b4753" strokeWidth="3" />
            <circle cx={C} cy={C} r="134" fill="none" stroke="#2a343e" strokeWidth="1.5" strokeDasharray="2 6" />
            {RIVETS.map((a) => (
              <circle key={a} cx={C + 142 * Math.cos(a)} cy={C + 142 * Math.sin(a)} r="2.6" fill="#4a5764" />
            ))}
            <g data-dial>
              <circle cx={C} cy={C} r="92" fill="#151c23" stroke="var(--coin-line)" strokeWidth="2" />
              {TICKS.map((i) => {
                const a = (i / 100) * Math.PI * 2 - Math.PI / 2;
                const long = i % 10 === 0;
                const r2 = long ? 76 : 83;
                return (
                  <g key={i}>
                    <line
                      data-tick
                      x1={C + 90 * Math.cos(a)}
                      y1={C + 90 * Math.sin(a)}
                      x2={C + r2 * Math.cos(a)}
                      y2={C + r2 * Math.sin(a)}
                      stroke={long ? "var(--coin)" : "#5b6874"}
                      strokeWidth={long ? 2.4 : 1.2}
                    />
                    {long && (
                      <text x={C + 66 * Math.cos(a)} y={C + 66 * Math.sin(a) + 4} textAnchor="middle" fontSize="11" fill="var(--muted)">
                        {i}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
            <path d={`M${C - 7} ${C - 104} L${C + 7} ${C - 104} L${C} ${C - 92}z`} fill="var(--coin)" />
            <g data-handle>
              <rect x={C - 6} y={C - 58} width="12" height="116" rx="6" fill="url(#vault-brass)" />
              <rect x={C - 58} y={C - 6} width="116" height="12" rx="6" fill="url(#vault-brass)" />
              <circle cx={C} cy={C} r="24" fill="url(#vault-brass)" stroke="var(--coin-line)" strokeWidth="2" />
              <circle cx={C} cy={C} r="9" fill="var(--coin-line)" />
            </g>
          </svg>
        </div>
        <p
          data-title
          className="max-w-[18ch] text-center font-display text-[clamp(28px,4.4vw,44px)] leading-[1.05] font-bold tracking-[-0.02em] text-balance"
        >
          {"Seu dinheiro, trancado no seu computador.".split(" ").map((w, i) => (
            <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
              <span data-word className={`inline-block ${w.startsWith("trancado") ? "text-accent" : ""}`}>{w}&nbsp;</span>
            </span>
          ))}
        </p>
      </div>
      <div
        data-flash
        className="invisible absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,#f3d59a,var(--coin)_30%,transparent_72%)]"
      />
      {/* Termina no fundo do app (no tema de quem usa), para a Visão geral entrar sem corte */}
      <div data-ground className="invisible absolute inset-0 bg-[var(--app-bg)]" />
    </div>
  );
}
