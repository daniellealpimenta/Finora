"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { api, qs, type Category } from "@/lib/api";
import { cycleName, cycleRange } from "@/lib/cycle";
import { money, shiftMonth } from "@/lib/format";
import { FULL, gsap, useGSAP } from "@/lib/motion";
import { playCoin } from "@/lib/sound";
import { CategoryIcon } from "./category-icon";
import type { CategoryRow, Merchant, Summary } from "./dashboard/types";
import { Guilloche } from "./guilloche";
import { Odometer } from "./odometer";
import { Pila, type PilaMood } from "./pila";
import { Button, IconButton, cx } from "./ui";

/**
 * Fechamento do ciclo (MASTER.md, "Assinatura"): uma vez por ciclo, na primeira visita depois
 * que a fatura fecha, o Pila conta como foi o ciclo que acabou em poucas telas curtas.
 * Dá para pular e rever depois pelo botão da Visão geral.
 */
const SEEN_KEY = "mf_recap_seen";

/** Instalação nova: o ciclo que fechou antes de o app existir não tem resumo para mostrar. */
export function skipRecapBefore(currentKey: string) {
  try {
    localStorage.setItem(SEEN_KEY, shiftMonth(currentKey, -1));
  } catch {
    /* segue */
  }
}

/** Ciclo que acabou de fechar e se o fechamento dele já foi visto. */
export function useRecap(currentKey: string | null) {
  const closedKey = currentKey ? shiftMonth(currentKey, -1) : null;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!closedKey) return;
    try {
      if (localStorage.getItem(SEEN_KEY) !== closedKey) setOpen(true);
    } catch {
      /* storage indisponível: não abre sozinho */
    }
  }, [closedKey]);

  // Estável: o diálogo usa no efeito que busca os dados
  const close = useCallback(() => {
    setOpen(false);
    try {
      if (closedKey) localStorage.setItem(SEEN_KEY, closedKey);
    } catch {
      /* segue */
    }
  }, [closedKey]);
  return { closedKey, open, show: () => setOpen(true), close };
}

type RecapData = { summary: Summary; categories: CategoryRow[]; merchants: Merchant[]; catalog: Category[] };

export function CycleRecap({ cycleKey, onClose }: { cycleKey: string; onClose: () => void }) {
  const [data, setData] = useState<RecapData | null>(null);
  const [step, setStep] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const slide = useRef<HTMLDivElement>(null);
  const rain = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = qs({ month: cycleKey });
    Promise.all([
      api<Summary>(`/dashboard/summary${q}`),
      api<CategoryRow[]>(`/dashboard/categories${q}`),
      api<Merchant[]>(`/dashboard/merchants${q}`),
      api<Category[]>("/categories"),
    ])
      .then(([summary, categories, merchants, catalog]) => setData({ summary, categories, merchants, catalog }))
      .catch(onClose);
  }, [cycleKey, onClose]);

  const slides = data ? buildSlides(data, cycleKey) : [];
  const last = step === slides.length - 1;
  const current = slides[step];

  // Cada tela entra subindo; a última, se fechou no azul, chove moeda e toca o "tlim"
  useGSAP(
    () => {
      if (!current) return;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from(slide.current, { y: 16, autoAlpha: 0, duration: 0.4, ease: "power3.out" });
        if (current.rain && rain.current) {
          const coins = gsap.utils.toArray<HTMLElement>(rain.current.children);
          gsap.fromTo(
            coins,
            { y: -40, x: () => gsap.utils.random(-20, 20), autoAlpha: 1, rotationY: 0 },
            {
              y: () => gsap.utils.random(320, 460),
              rotationY: () => gsap.utils.random(360, 900),
              autoAlpha: 0,
              duration: () => gsap.utils.random(1.1, 1.8),
              ease: "power1.in",
              stagger: 0.04,
            },
          );
        }
      });
      if (current.rain) playCoin();
      return () => mm.revert();
    },
    { dependencies: [step, Boolean(data)], revertOnUpdate: true },
  );

  // Esc fecha; setas navegam
  useEffect(() => {
    // Foco no Fechar (o painel em si ganharia o anel de foco global)
    panel.current?.querySelector<HTMLElement>("[data-dismiss]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, slides.length]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4 py-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Fechamento do ciclo de ${cycleName(cycleKey)}`}
        className="theme-dark relative isolate grid min-h-[min(520px,calc(100dvh-32px))] w-full max-w-lg overflow-hidden rounded-card bg-background p-6 text-foreground sm:p-8"
      >
        <Guilloche className="-z-10" x={0.85} y={0.15} />
        <div ref={rain} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-[1] flex justify-around">
          {Array.from({ length: 18 }, (_, i) => (
            <span
              key={i}
              className="invisible size-5 rounded-full bg-[var(--coin)] shadow-[inset_0_0_0_2px_var(--coin-line)]"
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          {/* A sequência é de verdade: os pontos dizem em que tela você está */}
          <div className="flex gap-1.5" aria-hidden>
            {slides.map((_, i) => (
              <span
                key={i}
                className={cx(
                  "h-1.5 rounded-full transition-[width,background-color] duration-[var(--dur-base)]",
                  i === step ? "w-6 bg-accent" : "w-1.5 bg-surface-2",
                )}
              />
            ))}
          </div>
          <IconButton label="Fechar" data-dismiss onClick={onClose} className="-mr-2">
            <X />
          </IconButton>
        </div>

        {current ? (
          <div ref={slide} className="grid content-center justify-items-start gap-5 py-6" aria-live="polite">
            <Pila mood={current.mood} size={112} alive={current.mood !== "sleep"} />
            <div className="grid gap-2">{current.body}</div>
          </div>
        ) : (
          <div className="grid place-items-center py-6">
            <Pila mood="neutral" size={96} />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 self-end">
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0} aria-label="Tela anterior">
            <ChevronLeft />
            Voltar
          </Button>
          {last ? (
            <Button variant="primary" onClick={onClose}>
              Ir para o ciclo novo
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setStep(step + 1)} disabled={!current}>
              Próximo
              <ChevronRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const Big = ({ value, className }: { value: number; className?: string }) => (
  <p className={cx("font-display text-[clamp(44px,10vw,64px)] leading-none font-normal tracking-[-0.02em] tabular", className)}>
    <span className="mr-1 align-[0.6em] text-[0.38em] font-bold tracking-normal text-accent">R$</span>
    <Odometer text={Math.floor(Math.abs(value)).toLocaleString("pt-BR")} />
    <Odometer
      text={"," + String(Math.round((Math.abs(value) % 1) * 100) % 100).padStart(2, "0")}
      className="text-[0.42em] text-muted"
    />
  </p>
);
const Title = ({ children }: { children: ReactNode }) => (
  <h2 className="font-display text-[28px] leading-tight font-bold tracking-[-0.02em]">{children}</h2>
);
const Note = ({ children }: { children: ReactNode }) => <p className="max-w-[40ch] text-muted">{children}</p>;

type Slide = { mood: PilaMood; body: ReactNode; rain?: boolean };

function buildSlides({ summary: s, categories, merchants, catalog }: RecapData, key: string): Slide[] {
  const name = cycleName(key);
  const f = s.flow;
  const keyById = new Map(catalog.map((c) => [c.id, c]));
  const top = [...categories].filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent)[0];
  const topMerchant = merchants[0];
  const spentTotal = f.spent + f.card_bills;

  if (s.income === 0 && s.expense === 0) {
    return [
      {
        mood: "sleep",
        body: (
          <>
            <Title>O ciclo de {name} fechou sem movimento.</Title>
            <Note>Quando os bancos trouxerem transações, eu conto aqui como foi cada ciclo.</Note>
          </>
        ),
      },
    ];
  }

  const slides: Slide[] = [
    {
      mood: "neutral",
      body: (
        <>
          <Title>O ciclo de {name} fechou.</Title>
          <Note>
            De {cycleRange(s.cycle)}. Separei o que importa em quatro telas. Dá para pular quando quiser.
          </Note>
        </>
      ),
    },
    {
      mood: "happy",
      body: (
        <>
          <Note>Entrou na conta</Note>
          <Big value={f.income} />
          <Note>Salário, Pix recebidos e outras receitas do ciclo.</Note>
        </>
      ),
    },
    {
      mood: "neutral",
      body: (
        <>
          <Note>Saiu, contando as faturas</Note>
          <Big value={spentTotal} />
          {top && (
            <div className="flex items-center gap-3 rounded-control bg-surface-2 px-3 py-2.5">
              <CategoryIcon categoryKey={top.category_id ? keyById.get(top.category_id)?.key : null} />
              <p className="text-sm">
                O maior gasto foi <strong>{top.category_name}</strong>: {money(top.spent)}.
                {topMerchant && (
                  <>
                    {" "}
                    Onde mais comprou: <strong>{topMerchant.name}</strong>.
                  </>
                )}
              </p>
            </div>
          )}
        </>
      ),
    },
    {
      mood: f.saved > 0 ? "happy" : "neutral",
      body:
        f.saved > 0 ? (
          <>
            <Note>Foi para os cofrinhos</Note>
            <Big value={f.saved} />
            <Note>Aportes menos resgates no ciclo.</Note>
          </>
        ) : (
          <>
            <Title>Neste ciclo nada foi para os cofrinhos.</Title>
            <Note>Uma meta de guardar na Previsão do ciclo ajuda o próximo a separar um pouco.</Note>
          </>
        ),
    },
  ];

  slides.push(
    f.result >= 0
      ? {
          mood: "celebrate",
          rain: true,
          body: (
            <>
              <Title>Fechou no azul.</Title>
              <Big value={f.result} className="text-positive" />
              <Note>Entrou mais do que saiu no ciclo de {name}.</Note>
            </>
          ),
        }
      : {
          mood: "worried",
          body: (
            <>
              <Title>Saiu mais do que entrou.</Title>
              <Big value={f.result} className="text-negative" />
              <Note>Ficou nesse valor no vermelho. Os orçamentos ajudam a segurar o próximo ciclo.</Note>
            </>
          ),
        },
  );
  return slides;
}
