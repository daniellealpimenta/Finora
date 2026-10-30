"use client";

import { Minus, X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { api, type WishItem } from "@/lib/api";
import { money } from "@/lib/format";
import { boing, FULL, gsap, motion, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { notify } from "@/lib/signals";
import { playCoin } from "@/lib/sound";
import { Pila } from "./pila";
import { Button, IconButton } from "./ui";

/**
 * O pote do desejo (MASTER.md, "Pote"): uma meta, não uma conta. Cada toque joga moedas em
 * arco até a tampa; elas caem e empilham no pote, que enche até a linha da meta. Bateu a meta:
 * o Pila comemora, toca o "tlim" e voa confete. O dinheiro de verdade continua onde está.
 */
const PER_ROW = 7;
const ROWS = 6;
const COINS = PER_ROW * ROWS;
const AMOUNTS = [10, 50, 100];
const CONFETTI = ["var(--pila-body)", "var(--coin)", "var(--positive)", "var(--cat-home)", "var(--cat-move)"];

function coinAt(i: number) {
  const row = Math.floor(i / PER_ROW);
  const col = i % PER_ROW;
  // Pequena desordem fixa por moeda: a pilha parece jogada, não desenhada
  const jitter = ((i * 37) % 5) - 2;
  return { x: 50 + col * 22 + (row % 2) * 10 + jitter, y: 232 - row * 14 };
}
const GOAL_Y = coinAt(COINS - 1).y - 12;

export function WishJar({ item, onClose, onChange }: { item: WishItem; onClose: () => void; onChange: (item: WishItem) => void }) {
  const [saved, setSaved] = useState(Number(item.saved));
  const price = Math.max(1, Number(item.price));
  const root = useRef<HTMLDivElement>(null);
  const lid = useRef<SVGRectElement>(null);
  const jar = useRef<SVGSVGElement>(null);
  const counter = useRef<HTMLParagraphElement>(null);
  const shownCoins = Math.round(Math.min(1, saved / price) * COINS);
  const reached = saved >= price;
  // Moedas já na tela antes da jogada: só as novas caem
  const before = useRef(shownCoins);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-veil]", { autoAlpha: 0, duration: 0.3 });
        gsap.from("[data-panel]", { y: 50, scale: 0.9, autoAlpha: 0, duration: 0.55, ease: "back.out(1.7)" });
        gsap.from("[data-jar]", { rotation: -8, y: 30, duration: 0.8, ease: "elastic.out(1, 0.6)", delay: 0.1 });
        gsap.from("[data-coin]", { y: -40, autoAlpha: 0, stagger: 0.012, duration: 0.4, ease: "bounce.out", delay: 0.3 });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  // Moedas novas caem e quicam no lugar delas
  useGSAP(
    () => {
      const fresh = gsap.utils.toArray<SVGGElement>("[data-coin]", root.current).slice(before.current);
      before.current = shownCoins;
      if (!fresh.length || prefersReducedMotion()) return;
      gsap.from(fresh, { y: -120, duration: 0.55, stagger: 0.05, ease: "bounce.out" });
    },
    { scope: root, dependencies: [shownCoins] },
  );

  const { contextSafe } = useGSAP({ scope: root });

  const confetti = contextSafe(() => {
    const box = jar.current?.getBoundingClientRect();
    if (!box || prefersReducedMotion()) return;
    for (let i = 0; i < 44; i++) {
      const bit = document.createElement("span");
      bit.className = "pointer-events-none fixed top-0 left-0 z-[80] h-3.5 w-2.5 rounded-[3px]";
      bit.style.background = CONFETTI[i % CONFETTI.length];
      document.body.appendChild(bit);
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 3;
      const a = gsap.utils.random(-Math.PI, 0);
      const speed = gsap.utils.random(140, 280);
      gsap
        .timeline({ onComplete: () => bit.remove() })
        .set(bit, { x, y })
        .to(bit, { x: x + Math.cos(a) * speed, duration: 1.6, ease: "power2.out" }, 0)
        .to(bit, { y: y + Math.sin(a) * speed, duration: 0.6, ease: "power2.out" }, 0)
        .to(bit, { y: y + 320, duration: 1, ease: "power1.in" }, 0.6)
        .to(bit, { rotation: gsap.utils.random(-720, 720), rotationX: gsap.utils.random(360, 1080), duration: 1.6, ease: "none" }, 0)
        .to(bit, { autoAlpha: 0, duration: 0.3 }, 1.3);
    }
  });

  // Moedas voam em arco do botão até a fenda da tampa
  const fly = contextSafe((from: HTMLElement, n: number) => {
    const box = jar.current?.getBoundingClientRect();
    if (!box || prefersReducedMotion()) return Promise.resolve();
    const b = from.getBoundingClientRect();
    const slot = { x: box.left + box.width * (115 / 230) - 13, y: box.top + box.height * (56 / 260) - 13 };
    gsap.to(lid.current, { y: -6, duration: 0.15, yoyo: true, repeat: Math.min(n, 4) * 2 - 1 });
    const flights = Array.from({ length: n }, (_, k) => {
      const coin = document.createElement("span");
      coin.className =
        "pointer-events-none fixed top-0 left-0 z-[80] size-[26px] rounded-full bg-[var(--coin)] shadow-[inset_0_0_0_3px_var(--coin-line)]";
      document.body.appendChild(coin);
      const x0 = b.left + b.width / 2 - 13;
      const y0 = b.top;
      return gsap
        .timeline({ delay: k * 0.1, onComplete: () => coin.remove() })
        .set(coin, { x: x0, y: y0 })
        .to(coin, {
          motionPath: {
            path: [
              { x: x0, y: y0 },
              { x: (x0 + slot.x) / 2 + gsap.utils.random(-40, 40), y: Math.min(y0, slot.y) - 130 },
              { x: slot.x, y: slot.y },
            ],
            curviness: 1.3,
          },
          rotationY: 720,
          ...motion.coinArc,
        })
        .to(coin, { scaleY: 0.1, y: "+=12", duration: 0.12, ease: "power2.in" })
        .then();
    });
    return Promise.all(flights);
  });

  const put = async (amount: number, button: HTMLElement) => {
    if (amount > 0) await fly(button, Math.min(5, Math.max(1, Math.round(amount / 20))));
    try {
      const updated = await api<WishItem>(`/wishlist/items/${item.id}/jar`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      const next = Number(updated.saved);
      const hit = saved < price && next >= price;
      setSaved(next);
      onChange(updated);
      boing(counter.current, 1.25);
      if (hit) {
        playCoin();
        confetti();
        notify(`Meta batida: ${item.name}!`, "ok", { mood: "celebrate" });
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "bad");
    }
  };

  const shownMood = reached ? "celebrate" : saved > 0 ? "happy" : "neutral";
  return createPortal(
    <div ref={root} className="fixed inset-0 z-50 grid place-items-center px-4 py-4">
      <div data-veil className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div
        data-panel
        role="dialog"
        aria-modal="true"
        aria-label={`Pote de ${item.name}`}
        className="relative grid max-h-[calc(100dvh-32px)] w-full max-w-md gap-4 overflow-y-auto rounded-card border border-card-edge bg-surface p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[24px] leading-tight font-bold tracking-[-0.02em]">{item.name}</h2>
            <p className="text-sm text-muted">Meta {money(price)} · o pote é só uma meta, o dinheiro fica onde está</p>
          </div>
          <IconButton label="Fechar" onClick={onClose}>
            <X />
          </IconButton>
        </div>

        <div className="relative grid justify-items-center">
          <svg ref={jar} data-jar viewBox="0 0 230 260" className="h-[240px] w-[212px] overflow-visible" aria-hidden>
            <defs>
              <clipPath id={`jar-${item.id}`}>
                <path d="M40 70 Q30 80 30 110 L30 222 Q30 246 56 246 L174 246 Q200 246 200 222 L200 110 Q200 80 190 70 Z" />
              </clipPath>
            </defs>
            <g clipPath={`url(#jar-${item.id})`}>
              <rect width="230" height="260" fill="var(--surface-2)" />
              {Array.from({ length: shownCoins }, (_, i) => {
                const { x, y } = coinAt(i);
                return (
                  <g key={i} data-coin transform={`translate(${x} ${y})`}>
                    <ellipse rx="13" ry="6.5" fill="var(--coin)" stroke="var(--coin-line)" strokeWidth="2" />
                    <ellipse cy="-1" rx="7" ry="2.5" fill="none" stroke="var(--coin-line)" strokeWidth="1.3" opacity=".6" />
                  </g>
                );
              })}
            </g>
            <path
              d="M40 70 Q30 80 30 110 L30 222 Q30 246 56 246 L174 246 Q200 246 200 222 L200 110 Q200 80 190 70"
              fill="none"
              stroke="var(--foreground)"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <line x1="36" x2="194" y1={GOAL_Y} y2={GOAL_Y} stroke="var(--positive)" strokeWidth="3" strokeDasharray="6 6" />
            <rect ref={lid} x="32" y="44" width="166" height="26" rx="10" fill="var(--pila-ear)" stroke="var(--foreground)" strokeWidth="5" />
            <rect x="96" y="52" width="38" height="8" rx="4" fill="var(--foreground)" />
            <path d="M48 120 Q44 160 48 200" stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".5" />
          </svg>
          <div className="absolute right-0 bottom-0">
            <Pila mood={shownMood} size={84} alive />
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <p ref={counter} className="origin-left font-display text-[32px] leading-none tabular">
            {money(saved)}
          </p>
          <p className="text-sm text-muted">{reached ? "meta batida!" : `faltam ${money(price - saved)}`}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {AMOUNTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={(e) => put(v, e.currentTarget)}
              className="rounded-card bg-[var(--coin)] px-2 py-3 font-display text-base font-bold text-[var(--pila-ink)] shadow-[inset_0_-4px_0_var(--coin-line)] transition-transform duration-[var(--dur-fast)] active:translate-y-0.5"
            >
              + {money(v).replace(",00", "")}
            </button>
          ))}
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" disabled={saved <= 0} onClick={(e) => put(-Math.min(50, saved), e.currentTarget)}>
            <Minus />
            Tirar {money(Math.min(50, saved)).replace(",00", "")}
          </Button>
          <Button variant="primary" onClick={onClose}>
            Pronto
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
