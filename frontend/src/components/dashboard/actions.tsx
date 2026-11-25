"use client";

import { CreditCard, Gamepad2, Gift, PiggyBank, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { NeedsGame } from "@/components/needs/game";
import type { NeedsSummary } from "@/components/needs/types";
import { api, qs, type CreditCardInfo, type SavingsPot } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { FULL, gsap, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { playSound } from "@/lib/sound";

/** Próxima fatura a pagar entre todos os cartões (a de vencimento mais perto). */
function nextBill(cards: CreditCardInfo[]) {
  return cards
    .flatMap((c) => c.bills.filter((b) => b.status !== "paid" && b.due_date && b.amount > 0))
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];
}

/**
 * Atalhos da Visão geral (opção "Doca", 2026-11-06): quatro botões grandes em pastel para o que
 * se faz toda semana. Cada um diz o próximo passo com um número real embaixo.
 */
export function QuickActions({ cards, pots, month }: { cards: CreditCardInfo[]; pots: SavingsPot[]; month: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const loadNeeds = useCallback(() => {
    api<NeedsSummary>(`/needs/summary${qs({ month })}`)
      .then((s) => setOpen(s.open_count))
      .catch(() => setOpen(null));
  }, [month]);
  useEffect(loadNeeds, [loadNeeds]);
  const closeGame = useCallback(
    (changed: boolean) => {
      setPlaying(false);
      if (changed) loadNeeds();
    },
    [loadNeeds],
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-tile]", {
          scale: 0.85,
          rotation: (i) => [-4, 3, -2, 4][i % 4],
          autoAlpha: 0,
          stagger: 0.07,
          duration: 0.6,
          ease: "back.out(2)",
          delay: 0.25,
          clearProps: "transform,opacity,visibility",
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  // Aperta e volta com mola: os atalhos são peças pequenas, o elástico cabe aqui
  const press = (el: HTMLElement) => {
    playSound("tap");
    if (!prefersReducedMotion()) gsap.fromTo(el, { scale: 0.92 }, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" });
  };

  const bill = nextBill(cards);
  const saved = pots.reduce((sum, p) => sum + Number(p.current_balance), 0);

  return (
    <div ref={root} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Tile href="/cofrinhos" icon={PiggyBank} color="var(--tile-gold)" title="Guardar" note={saved > 0 ? `${money(saved)} nos cofrinhos` : "comece um cofrinho"} onPress={press} />
      <Tile
        href="/contas"
        icon={CreditCard}
        color="var(--tile-blue)"
        title="Fatura"
        note={bill ? `${money(bill.amount)} em ${shortDate(bill.due_date!)}` : "nenhuma a pagar"}
        onPress={press}
      />
      <Tile
        icon={Gamepad2}
        color="var(--tile-violet)"
        title="Precisava?"
        note={open === null ? "jogue os gastos do ciclo" : open > 0 ? `${open} ${open === 1 ? "carta" : "cartas"} para jogar` : "tudo jogado neste ciclo"}
        onPress={(el) => {
          press(el);
          setPlaying(true);
        }}
      />
      <Tile href="/desejos" icon={Gift} color="var(--tile-pink)" title="Desejos" note="encha o pote de cada um" onPress={press} />
      {playing && <NeedsGame month={month} onClose={closeGame} />}
    </div>
  );
}

function Tile({
  href,
  icon: Icon,
  color,
  title,
  note,
  onPress,
}: {
  href?: string;
  icon: LucideIcon;
  color: string;
  title: string;
  note: string;
  onPress: (el: HTMLElement) => void;
}) {
  const className =
    "relative grid min-h-[112px] content-between justify-items-start overflow-hidden rounded-[calc(var(--r-card)+8px)] p-4 text-left text-[var(--tile-ink)] transition-[translate] duration-[var(--dur-base)] hover:-translate-y-0.5 sm:p-5";
  const inner = (
    <>
      {/* Brilho de cima para baixo: o "plástico" dos botões da referência */}
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgb(255_255_255/.38),transparent_55%)]" aria-hidden />
      <Icon className="relative size-6" strokeWidth={2.2} aria-hidden />
      <span className="relative grid">
        <span className="font-display text-base font-bold">{title}</span>
        <span className="text-xs font-semibold opacity-75">{note}</span>
      </span>
    </>
  );
  if (href)
    return (
      <Link href={href} data-tile style={{ background: color }} className={className} onClick={(e) => onPress(e.currentTarget)}>
        {inner}
      </Link>
    );
  return (
    <button type="button" data-tile style={{ background: color }} className={className} onClick={(e) => onPress(e.currentTarget)}>
      {inner}
    </button>
  );
}
