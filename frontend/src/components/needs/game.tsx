"use client";

import { ArrowLeft, ArrowRight, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CategoryIcon, categoryStyle } from "@/components/category-icon";
import { Pila, type PilaMood } from "@/components/pila";
import { Button, IconButton, cx } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { cycleName } from "@/lib/cycle";
import { money, shortDate } from "@/lib/format";
import { boing, Draggable, FULL, gsap, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { notify } from "@/lib/signals";
import { playCoin } from "@/lib/sound";
import type { NeedCard } from "./types";

/**
 * "Precisava ou foi vontade?" (MASTER.md, "Jogo"): cada gasto do ciclo vira uma carta.
 * Arraste para a esquerda (precisava) ou para a direita (foi vontade); os botões e as setas do
 * teclado fazem o mesmo. A carta ganha o carimbo, voa para o cesto e o cesto pula.
 */
const THROW = 110; // px de arraste para valer como jogada
const STACK = 3; // cartas visíveis no monte

type Side = "need" | "want";

export function NeedsGame({ month, onClose }: { month: string; onClose: (changed: boolean) => void }) {
  const [queue, setQueue] = useState<NeedCard[] | null>(null);
  const [played, setPlayed] = useState<{ card: NeedCard; side: Side }[]>([]);
  const [total, setTotal] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const deck = useRef<HTMLDivElement>(null);
  const bins = { need: useRef<HTMLButtonElement>(null), want: useRef<HTMLButtonElement>(null) };
  const counts = { need: useRef<HTMLElement>(null), want: useRef<HTMLElement>(null) };
  const busy = useRef(false);

  useEffect(() => {
    api<NeedCard[]>(`/needs/deck${qs({ month })}`)
      .then((cards) => {
        const open = cards.filter((c) => c.need === null);
        setQueue(open);
        setTotal(open.length);
      })
      .catch((e) => {
        notify(e.message, "bad");
        onClose(false);
      });
  }, [month, onClose]);

  const top = queue?.[0];
  const done = queue !== null && queue.length === 0;
  const tally = (side: Side) => played.filter((p) => p.side === side).reduce((s, p) => s + p.card.amount, 0);

  // Entrada: o painel sobe; as cartas caem no monte como um baralho sendo dado
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-veil]", { autoAlpha: 0, duration: 0.3 });
        gsap.from("[data-panel]", { y: 60, scale: 0.92, autoAlpha: 0, duration: 0.55, ease: "back.out(1.6)" });
      });
      return () => mm.revert();
    },
    { scope: root },
  );
  // O monte: cada carta abaixo da de cima fica um pouco mais baixa e torta. Quem posiciona é o
  // GSAP (não o style do React), para o monte andar animado quando a de cima sai
  const dealt = useRef(false);
  useGSAP(
    () => {
      if (!queue) return;
      gsap.utils.toArray<HTMLElement>("[data-card]", deck.current).forEach((el) => {
        const d = Number(el.dataset.depth);
        if (d === 0) return;
        const to = { x: 0, y: d * 8, rotation: d % 2 ? 3 : -3, scale: 1 };
        if (!dealt.current || prefersReducedMotion()) gsap.set(el, to);
        else gsap.to(el, { ...to, duration: 0.4, ease: "back.out(2)" });
      });
    },
    { scope: root, dependencies: [queue] },
  );
  useGSAP(
    () => {
      if (!queue || dealt.current) return;
      dealt.current = true;
      if (played.length) return;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-card]", {
          y: -380,
          rotation: () => gsap.utils.random(-40, 40),
          autoAlpha: 0,
          stagger: { each: 0.09, from: "end" },
          duration: 0.65,
          ease: "back.out(1.3)",
        });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [queue === null] },
  );

  const { contextSafe } = useGSAP({ scope: root });

  const play = contextSafe((side: Side, card: NeedCard, el: HTMLElement | null) => {
    if (busy.current) return;
    busy.current = true;
    Draggable.get(el)?.kill();
    api(`/transactions/${card.id}/need`, { method: "PUT", body: JSON.stringify({ need: side === "need" }) }).catch(
      (e) => notify(e.message, "bad"),
    );
    const finish = () => {
      setQueue((q) => (q ? q.slice(1) : q));
      setPlayed((p) => [...p, { card, side }]);
      busy.current = false;
      boing(bins[side].current, 1.15);
      boing(counts[side].current, 1.6);
    };
    if (!el || prefersReducedMotion()) return finish();
    const bin = bins[side].current!.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    gsap.set(el.querySelector(`[data-stamp="${side}"]`), { autoAlpha: 1 });
    gsap.to(el, {
      x: `+=${bin.left + bin.width / 2 - (rect.left + rect.width / 2)}`,
      y: `+=${bin.top + bin.height / 2 - (rect.top + rect.height / 2)}`,
      rotation: side === "need" ? -35 : 35,
      scale: 0.18,
      autoAlpha: 0,
      duration: 0.5,
      ease: "power3.in",
      onComplete: finish,
    });
  });

  // A carta de cima vira arrastável; o ângulo e os carimbos seguem o dedo
  useGSAP(
    () => {
      if (!top) return;
      const el = deck.current?.querySelector<HTMLElement>(`[data-card="${top.id}"]`);
      if (!el) return;
      gsap.to(el, { rotation: 0, y: 0, scale: 1.02, duration: 0.4, ease: "back.out(2)" });
      const stamp = (s: Side) => el.querySelector(`[data-stamp="${s}"]`);
      const [drag] = Draggable.create(el, {
        type: "x,y",
        zIndexBoost: false,
        onDrag() {
          gsap.set(el, { rotation: this.x / 12 });
          gsap.set(stamp("need"), { autoAlpha: gsap.utils.clamp(0, 1, -this.x / THROW) });
          gsap.set(stamp("want"), { autoAlpha: gsap.utils.clamp(0, 1, this.x / THROW) });
          gsap.to(bins.need.current, { scale: this.x < -THROW / 2 ? 1.08 : 1, duration: 0.2 });
          gsap.to(bins.want.current, { scale: this.x > THROW / 2 ? 1.08 : 1, duration: 0.2 });
        },
        onRelease() {
          if (Math.abs(this.x) > THROW) return play(this.x < 0 ? "need" : "want", top, el);
          gsap.to(el, { x: 0, y: 0, rotation: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" });
          gsap.to([stamp("need"), stamp("want")], { autoAlpha: 0, duration: 0.2 });
          gsap.to([bins.need.current, bins.want.current], { scale: 1, duration: 0.2 });
        },
      });
      return () => drag.kill();
    },
    { scope: root, dependencies: [top?.id] },
  );

  // Desfazer: a última carta volta para o topo do monte
  const undo = contextSafe(() => {
    const last = played[played.length - 1];
    if (!last || busy.current) return;
    api(`/transactions/${last.card.id}/need`, { method: "PUT", body: JSON.stringify({ need: null }) }).catch((e) =>
      notify(e.message, "bad"),
    );
    setPlayed((p) => p.slice(0, -1));
    setQueue((q) => [last.card, ...(q ?? [])]);
  });

  const choose = useCallback(
    (side: Side) => top && play(side, top, deck.current?.querySelector<HTMLElement>(`[data-card="${top.id}"]`) ?? null),
    [top, play],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(played.length > 0);
      if (e.key === "ArrowLeft") choose("need");
      if (e.key === "ArrowRight") choose("want");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, onClose, played.length]);

  // Fim do monte: o Pila comenta e, se a vontade foi pouca, chove moeda
  const want = tally("want");
  const need = tally("need");
  const share = need + want > 0 ? want / (need + want) : 0;
  const mood: PilaMood = done ? (share > 0.4 ? "worried" : "celebrate") : "neutral";
  useGSAP(
    () => {
      if (!done) return;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-done] > *", { y: 30, autoAlpha: 0, stagger: 0.08, duration: 0.5, ease: "back.out(1.8)" });
      });
      if (played.length && share <= 0.4) playCoin();
      return () => mm.revert();
    },
    { scope: root, dependencies: [done] },
  );

  const shown = (queue ?? []).slice(0, STACK);
  const left = queue?.length ?? 0;

  // No body: o painel usa transform na troca de ciclo, e isso prenderia o "fixed" no card
  return createPortal(
    <div ref={root} className="fixed inset-0 z-50 grid place-items-center px-4 py-4">
      <div data-veil className="absolute inset-0 bg-black/55" onClick={() => onClose(played.length > 0)} aria-hidden />
      <div
        data-panel
        role="dialog"
        aria-modal="true"
        aria-label="Precisava ou foi vontade?"
        className="relative grid max-h-[calc(100dvh-32px)] w-full max-w-md gap-4 overflow-x-hidden overflow-y-auto rounded-card border border-card-edge bg-surface p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[24px] leading-tight font-bold tracking-[-0.02em]">Precisava ou foi vontade?</h2>
            <p className="text-sm text-muted">
              Gastos de {cycleName(month)}.{" "}
              {queue && total > 0 && !done && (
                <>
                  Carta {total - left + 1} de {total}.
                </>
              )}
            </p>
          </div>
          <IconButton label="Fechar" onClick={() => onClose(played.length > 0)}>
            <X />
          </IconButton>
        </div>

        <div ref={deck} className="relative h-[300px] [perspective:900px]">
          {queue === null && <div className="grid h-full place-items-center"><Pila mood="neutral" size={96} /></div>}
          {done && (
            <div data-done className="grid h-full content-center justify-items-center gap-2 text-center">
              <Pila mood={total === 0 ? "sleep" : mood} size={112} alive />
              <p className="font-display text-[22px] font-bold">
                {total === 0
                  ? "Nada para jogar neste ciclo."
                  : played.length === 0
                    ? "Todas as cartas já foram jogadas."
                    : share > 0.4
                      ? "Muita vontade neste ciclo!"
                      : "Ciclo no controle!"}
              </p>
              {played.length > 0 && (
                <p className="text-sm text-muted">
                  Precisava {money(need)} · Vontade {money(want)}
                </p>
              )}
            </div>
          )}
          {[...shown].reverse().map((card) => {
            const depth = shown.indexOf(card);
            const { color } = categoryStyle(card.category_key, "EXPENSE");
            return (
              <article
                key={card.id}
                data-card={card.id}
                data-depth={depth}
                style={{ zIndex: STACK - depth }}
                className={cx(
                  "absolute inset-x-2 inset-y-0 grid touch-none content-center justify-items-center gap-2 rounded-[22px] border-2 bg-surface p-5 text-center select-none",
                  depth === 0 ? "cursor-grab border-foreground active:cursor-grabbing" : "border-border",
                )}
              >
                <span data-stamp="need" className="invisible absolute top-4 left-4 -rotate-12 rounded-control border-[3px] border-[var(--cat-home)] px-2 py-0.5 font-display text-sm font-bold text-[var(--cat-home)]">
                  PRECISAVA
                </span>
                <span data-stamp="want" className="invisible absolute top-4 right-4 rotate-12 rounded-control border-[3px] border-negative px-2 py-0.5 font-display text-sm font-bold text-negative">
                  VONTADE
                </span>
                <span style={{ color }}>
                  <CategoryIcon categoryKey={card.category_key} kind="EXPENSE" />
                </span>
                <p className="line-clamp-2 max-w-[22ch] font-display text-[22px] leading-tight font-bold">{card.label}</p>
                <p className="font-display text-[34px] leading-none tabular">{money(card.amount)}</p>
                <p className="text-sm text-muted">
                  {card.category_name} · {shortDate(card.date)}
                </p>
              </article>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            ref={bins.need}
            type="button"
            onClick={() => choose("need")}
            disabled={!top}
            className="grid justify-items-center gap-0.5 rounded-card bg-[color-mix(in_oklab,var(--cat-home)_14%,transparent)] px-3 py-3 font-semibold text-[var(--cat-home)] disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5 text-sm">
              <ArrowLeft className="size-4" /> Precisava
            </span>
            <b ref={counts.need} className="font-display text-xl tabular">
              {money(need)}
            </b>
          </button>
          <button
            ref={bins.want}
            type="button"
            onClick={() => choose("want")}
            disabled={!top}
            className="grid justify-items-center gap-0.5 rounded-card bg-[color-mix(in_oklab,var(--negative)_14%,transparent)] px-3 py-3 font-semibold text-negative disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5 text-sm">
              Foi vontade <ArrowRight className="size-4" />
            </span>
            <b ref={counts.want} className="font-display text-xl tabular">
              {money(want)}
            </b>
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={undo} disabled={!played.length}>
            <Undo2 />
            Desfazer
          </Button>
          <Button variant={done ? "primary" : "secondary"} onClick={() => onClose(played.length > 0)}>
            {done ? "Ver o índice" : "Continuar depois"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
