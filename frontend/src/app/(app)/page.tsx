"use client";

import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CashflowPoint, DailyPoint } from "@/components/charts";
import {
  CashflowCard,
  CategoriesCard,
  CommitmentsCard,
  FixedCard,
  HealthCard,
  HeroCard,
  InstallmentsCard,
  MerchantsCard,
  PaceCard,
  RecurringCard,
  ReserveCard,
  SavingsCard,
  centsPart,
  heroValueOf,
  intPart,
  RING_LENGTH,
} from "@/components/dashboard/cards";
import { BillsCard, CardsCard } from "@/components/dashboard/credit";
import { ForecastCard } from "@/components/dashboard/forecast";
import { PanelCatalog, PanelGrid, usePanelLayout } from "@/components/dashboard/panel";
import type {
  CategoryRow,
  Commitment,
  Data,
  Forecast,
  Merchant,
  Recurring,
  Summary,
} from "@/components/dashboard/types";
import { CyclePicker } from "@/components/cycle-picker";
import { Pila } from "@/components/pila";
import { Button, Card, ErrorNote, PageHeader } from "@/components/ui";
import {
  api,
  qs,
  type Category,
  type CreditCardInfo,
  type Installment,
  type Investment,
  type SavingsPot,
} from "@/lib/api";
import { useCycle } from "@/lib/cycle";
import { shortDate } from "@/lib/format";
import { FULL, gsap, motion, prefersReducedMotion, useGSAP } from "@/lib/motion";

export default function Dashboard() {
  const { key: month, setKey: setMonth, info: cycle, error: cycleError } = useCycle();
  const [data, setData] = useState<Data | null>(null);
  const [pots, setPots] = useState<SavingsPot[]>([]);
  const [looseTotal, setLooseTotal] = useState(0);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [cards, setCards] = useState<CreditCardInfo[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const layout = usePanelLayout();
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // Direção da última troca de ciclo (0 = primeira carga) e último valor mostrado no topo
  const direction = useRef(0);
  const shownHero = useRef(0);

  // Previsão: sempre do ciclo atual
  const loadForecast = useCallback(() => {
    api<Forecast>("/dashboard/forecast")
      .then(setForecast)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(loadForecast, [loadForecast]);

  // Cofrinhos, parcelas e cartões não dependem do ciclo escolhido
  useEffect(() => {
    Promise.all([
      api<SavingsPot[]>("/pots"),
      api<Investment[]>("/investments"),
      api<Installment[]>("/dashboard/installments"),
      api<CreditCardInfo[]>("/cards"),
    ])
      .then(([p, inv, inst, cardList]) => {
        setPots(p);
        setLooseTotal(inv.filter((i) => i.pot_id === null).reduce((sum, i) => sum + Number(i.balance), 0));
        setInstallments(inst);
        setCards(cardList);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!month) return;
    const q = qs({ month });
    Promise.all([
      api<Summary>(`/dashboard/summary${q}`),
      api<CashflowPoint[]>(`/dashboard/cashflow${q}`),
      api<CategoryRow[]>(`/dashboard/categories${q}`),
      api<DailyPoint[]>(`/dashboard/daily${q}`),
      api<Merchant[]>(`/dashboard/merchants${q}`),
      api<Recurring[]>("/dashboard/recurring"),
      api<Commitment[]>("/dashboard/commitments"),
      api<Category[]>("/categories"),
    ])
      .then(([summary, cashflow, categories, daily, merchants, recurring, commitments, catalog]) => {
        // No ciclo atual, a linha "este ciclo" para no dia de hoje
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        daily = daily.map((d) => ({
          ...d,
          label: shortDate(d.date),
          current: summary.cycle.is_current && d.date > today ? null : d.current,
        }));
        setData({ month, summary, cashflow, categories, daily, merchants, recurring, commitments, catalog });
        setError(null);
      })
      .catch((e) => {
        setError(e.message);
        gsap.set(content.current, { clearProps: "transform,opacity,visibility" });
      });
  }, [month]);

  const { contextSafe } = useGSAP({ scope: root });

  const changeMonth = contextSafe((next: string) => {
    direction.current = month && next > month ? 1 : -1;
    if (!prefersReducedMotion() && content.current)
      gsap.to(content.current, {
        x: -motion.monthOut.x * direction.current,
        autoAlpha: 0,
        duration: motion.monthOut.duration,
        ease: motion.monthOut.ease,
      });
    setMonth(next);
  });

  const heroValue = data ? heroValueOf(data.summary) : 0;

  // Momentos de entrada: primeira carga orquestrada; troca de mês desliza na direção da seta
  useGSAP(
    () => {
      if (!data) return;
      const from = shownHero.current;
      shownHero.current = heroValue;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        const q = gsap.utils.selector(root);
        const first = direction.current === 0;
        const tl = gsap.timeline();

        if (first) {
          tl.from(q("[data-enter]"), {
            y: motion.enter.y,
            autoAlpha: 0,
            duration: motion.enter.duration,
            ease: motion.enter.ease,
            stagger: motion.enter.stagger,
            clearProps: "transform,opacity,visibility",
          });
        } else {
          tl.fromTo(
            content.current,
            { x: motion.monthIn.x * direction.current, autoAlpha: 0 },
            { x: 0, autoAlpha: 1, duration: motion.monthIn.duration, ease: motion.monthIn.ease, overwrite: "auto" },
          );
        }
        const at = first ? 0.3 : 0;

        // Número do topo conta do valor anterior (ou de zero) até o novo
        const counter = { v: first ? 0 : from };
        const [int] = q("[data-hero-int]");
        const [cents] = q("[data-hero-cents]");
        tl.to(
          counter,
          {
            v: heroValue,
            ...motion.count,
            onUpdate: () => {
              if (int) int.textContent = intPart(counter.v);
              if (cents) cents.textContent = centsPart(counter.v);
            },
          },
          at,
        );

        const ring = q("[data-ring]");
        if (ring.length) {
          tl.from(ring, { attr: { "stroke-dashoffset": RING_LENGTH }, ...motion.ring }, at + 0.15);
          tl.from(q("[data-score]"), { textContent: 0, snap: { textContent: 1 }, ...motion.ring }, at + 0.15);
        }
        tl.from(q("[data-pop]"), { scale: 0.6, autoAlpha: 0, ...motion.pop, stagger: 0.08 }, at + 0.8);
        tl.fromTo(q("[data-shine]"), { xPercent: -120 }, { xPercent: 320, ...motion.shine }, at + 1.1);
        tl.from(
          q("[data-fill]"),
          { scaleX: 0, duration: motion.fill.duration, ease: motion.fill.ease, stagger: 0.03 },
          at + 0.2,
        );
      });
      return () => mm.revert();
    },
    { dependencies: [data], scope: root, revertOnUpdate: true },
  );

  const s = data?.summary;
  const hasData = data && data.cashflow.some((c) => c.income > 0 || c.expense > 0);
  const keyById = new Map(data?.catalog.map((c) => [c.id, c]) ?? []);

  return (
    <div ref={root}>
      <PageHeader
        title="Visão geral"
        actions={
          <>
            <Button variant={editing ? "primary" : "ghost"} onClick={() => setEditing(!editing)} aria-pressed={editing}>
              <LayoutGrid />
              {editing ? "Concluir" : "Personalizar"}
            </Button>
            {month && <CyclePicker value={month} info={cycle} onChange={changeMonth} />}
          </>
        }
      />
      <div ref={content} className="grid gap-4">
        {(error || cycleError) && <ErrorNote>{error ?? cycleError}</ErrorNote>}

        {data && !hasData && (
          <Card className="grid justify-items-center gap-4 py-10 text-center">
            <Pila mood="sleep" size={120} />
            <p className="max-w-sm text-sm text-muted">
              Ainda não há transações. O Pila está cochilando: conecte um banco ou importe um extrato em{" "}
              <Link href="/contas" className="font-semibold text-accent underline underline-offset-2">
                Contas
              </Link>
              .
            </p>
          </Card>
        )}

        {editing && <PanelCatalog layout={layout} onDone={() => setEditing(false)} />}

        {s && data && hasData && (
          <PanelGrid
            layout={layout}
            editing={editing}
            cards={{
              hero: <HeroCard data={data} keyById={keyById} />,
              forecast:
                forecast && s.cycle.is_current ? <ForecastCard data={forecast} onChanged={loadForecast} /> : null,
              health: <HealthCard health={s.health} />,
              reserve: <ReserveCard months={s.emergency_reserve_months} avg={s.avg_monthly_expense} />,
              fixed: <FixedCard commitment={s.fixed_commitment} monthly={s.fixed_monthly} />,
              bills: cards.length ? <BillsCard cards={cards} /> : null,
              cards: cards.length ? <CardsCard cards={cards} /> : null,
              savings: <SavingsCard pots={pots} looseTotal={looseTotal} saved={s.flow.saved} month={data.month} />,
              installments: <InstallmentsCard items={installments} keyById={keyById} />,
              cashflow: <CashflowCard data={data.cashflow} selected={data.month} />,
              categories: <CategoriesCard rows={data.categories} keyById={keyById} />,
              pace: <PaceCard data={data} />,
              commitments: data.commitments.some((c) => c.amount > 0) ? <CommitmentsCard data={data} /> : null,
              merchants: <MerchantsCard data={data} />,
              recurring: <RecurringCard data={data} />,
            }}
          />
        )}
      </div>
    </div>
  );
}
