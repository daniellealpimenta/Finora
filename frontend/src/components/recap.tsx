"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { api, qs, type Category } from "@/lib/api";
import { cycleName, cycleRange } from "@/lib/cycle";
import { money, percent, shiftMonth } from "@/lib/format";
import { FULL, gsap, prefersReducedMotion, SplitText, useGSAP } from "@/lib/motion";
import { playCoin } from "@/lib/sound";
import { CategoryIcon } from "./category-icon";
import type { CategoryRow, Merchant, Summary } from "./dashboard/types";
import type { NeedsSummary } from "./needs/types";
import { Guilloche } from "./guilloche";
import { Pila, type PilaMood } from "./pila";
import { Button, IconButton, cx } from "./ui";

/**
 * Fechamento do ciclo (MASTER.md, "Assinatura"): uma vez por ciclo, na primeira visita depois
 * que a fatura fecha, o Pila conta como foi o ciclo que acabou. Tela cheia, números grandes:
 * abre num círculo, cada título sobe letra a letra, cada valor conta do zero e, se fechou no
 * azul, chove moeda. Dá para pular e rever depois pelo botão da Visão geral.
 */
const SEEN_KEY = "mf_recap_seen";

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

type RecapData = {
  summary: Summary;
  categories: CategoryRow[];
  merchants: Merchant[];
  catalog: Category[];
  needs: NeedsSummary | null;
};

const RAIN = 26;

export function CycleRecap({ cycleKey, onClose }: { cycleKey: string; onClose: () => void }) {
  const [data, setData] = useState<RecapData | null>(null);
  const [step, setStep] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const slide = useRef<HTMLDivElement>(null);
  const rain = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    const q = qs({ month: cycleKey });
    Promise.all([
      api<Summary>(`/dashboard/summary${q}`),
      api<CategoryRow[]>(`/dashboard/categories${q}`),
      api<Merchant[]>(`/dashboard/merchants${q}`),
      api<Category[]>("/categories"),
      api<NeedsSummary>(`/needs/summary${q}`).catch(() => null),
    ])
      .then(([summary, categories, merchants, catalog, needs]) =>
        setData({ summary, categories, merchants, catalog, needs }),
      )
      .catch(onClose);
  }, [cycleKey, onClose]);

  const slides = data ? buildSlides(data, cycleKey) : [];
  const last = step === slides.length - 1;
  const current = slides[step];

  // Abre num círculo que cresce do centro
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.fromTo(
          root.current,
          { clipPath: "circle(0% at 50% 50%)" },
          { clipPath: "circle(150% at 50% 50%)", duration: 0.8, ease: "power3.inOut" },
        );
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  const { contextSafe } = useGSAP({ scope: root });
  const close = contextSafe(() => {
    if (closing.current) return;
    closing.current = true;
    if (prefersReducedMotion()) return onClose();
    gsap.to(root.current, {
      clipPath: "circle(0% at 50% 50%)",
      duration: 0.55,
      ease: "power3.inOut",
      onComplete: onClose,
    });
  });

  // Cada tela: título letra a letra, valor contando do zero, apoio subindo; no azul, chuva
  useGSAP(
    () => {
      if (!current || !slide.current) return;
      const q = gsap.utils.selector(slide);
      const value = q("[data-value]")[0] as HTMLElement | undefined;
      const target = current.value ?? 0;
      const show = (v: number) => {
        if (!value) return;
        const [int, cents] = money(Math.abs(v)).replace("R$", "").trim().split(",");
        value.querySelector("[data-int]")!.textContent = int;
        value.querySelector("[data-cents]")!.textContent = "," + (cents ?? "00");
      };
      show(target);

      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        const tl = gsap.timeline();
        tl.from(q("[data-pila]"), { y: 40, scale: 0.7, autoAlpha: 0, duration: 0.6, ease: "back.out(2)" })
          .from(q("[data-eyebrow]"), { y: 16, autoAlpha: 0, duration: 0.4, ease: "power3.out" }, 0.1);
        const title = q("[data-split]")[0];
        if (title) {
          const split = SplitText.create(title, { type: "chars,words", mask: "words" });
          tl.from(split.chars, { yPercent: 115, rotation: 8, stagger: 0.022, duration: 0.7, ease: "power4.out" }, 0.15);
        }
        if (value) {
          const counter = { v: 0 };
          tl.from(value, { scale: 0.75, autoAlpha: 0, duration: 0.5, ease: "back.out(1.8)" }, 0.2).to(
            counter,
            { v: target, duration: 1.4, ease: "power3.out", onUpdate: () => show(counter.v) },
            0.25,
          );
        }
        tl.from(q("[data-note]"), { y: 18, autoAlpha: 0, stagger: 0.12, duration: 0.5, ease: "power3.out" }, 0.5)
          .from(q("[data-extra] > *"), { y: 24, autoAlpha: 0, stagger: 0.08, duration: 0.5, ease: "back.out(1.6)" }, 0.6)
          .from(q("[data-bar]"), { scaleX: 0, transformOrigin: "left", stagger: 0.1, duration: 0.8, ease: "power3.out" }, 0.7);

        if (current.rain && rain.current) {
          const coins = gsap.utils.toArray<HTMLElement>(rain.current.children);
          gsap.fromTo(
            coins,
            { y: -60, x: () => gsap.utils.random(-30, 30), autoAlpha: 1, rotation: 0, rotationY: 0 },
            {
              y: () => window.innerHeight + 80,
              rotation: () => gsap.utils.random(-360, 360),
              rotationY: () => gsap.utils.random(360, 1080),
              duration: () => gsap.utils.random(1.3, 2.2),
              delay: () => gsap.utils.random(0, 0.7),
              ease: "power1.in",
            },
          );
        }
      });
      if (current.rain) playCoin();
      return () => mm.revert();
    },
    { dependencies: [step, Boolean(data)], scope: root, revertOnUpdate: true },
  );

  // Esc fecha; setas navegam
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("[data-dismiss]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, slides.length]);

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`Fechamento do ciclo de ${cycleName(cycleKey)}`}
      className="theme-dark fixed inset-0 z-50 isolate grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground"
    >
      <Guilloche className="-z-10" x={0.82} y={0.2} />
      <div ref={rain} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-around">
        {Array.from({ length: RAIN }, (_, i) => (
          <span
            key={i}
            className="invisible size-7 rounded-full bg-[var(--coin)] shadow-[inset_0_0_0_3px_var(--coin-line)]"
          />
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 pt-[calc(16px+env(safe-area-inset-top,0px))] sm:px-8">
        {/* A sequência é de verdade: as barras dizem em que tela você está */}
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {slides.map((_, i) => (
            <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className={cx(
                  "block h-full origin-left rounded-full bg-accent transition-transform duration-500 ease-[var(--ease-out)]",
                  i <= step ? "scale-x-100" : "scale-x-0",
                )}
              />
            </span>
          ))}
        </div>
        <IconButton label="Fechar" data-dismiss onClick={close}>
          <X />
        </IconButton>
      </div>

      {current ? (
        <div
          ref={slide}
          key={step}
          aria-live="polite"
          className="mx-auto grid w-full max-w-5xl content-center items-center gap-6 overflow-y-auto px-4 py-6 sm:px-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12"
        >
          <div data-pila className="justify-self-start md:justify-self-center">
            <Pila mood={current.mood} size={180} alive={current.mood !== "sleep"} className="max-sm:hidden" />
            <Pila mood={current.mood} size={112} alive={current.mood !== "sleep"} className="sm:hidden" />
          </div>
          <div className="grid min-w-0 gap-4">
            {current.eyebrow && (
              <p data-eyebrow className="text-sm font-semibold text-accent">
                {current.eyebrow}
              </p>
            )}
            {current.title && (
              <h2
                data-split
                className="max-w-[16ch] font-display text-[clamp(40px,7vw,88px)] leading-[0.95] font-bold tracking-[-0.03em] text-balance"
              >
                {current.title}
              </h2>
            )}
            {current.value !== undefined && (
              <p
                data-value
                className={cx(
                  "font-display text-[clamp(64px,13vw,168px)] leading-[0.9] font-normal tracking-[-0.04em] tabular",
                  current.tone === "pos" && "text-positive",
                  current.tone === "neg" && "text-negative",
                )}
              >
                <span className="mr-2 align-[0.9em] text-[0.26em] font-bold tracking-normal text-accent">
                  {(current.value ?? 0) < 0 ? "−R$" : "R$"}
                </span>
                <span data-int>0</span>
                <span data-cents className="align-[0.75em] text-[0.36em] text-muted">
                  ,00
                </span>
              </p>
            )}
            {current.note && (
              <p data-note className="max-w-[46ch] text-lg leading-relaxed text-muted">
                {current.note}
              </p>
            )}
            {current.extra && (
              <div data-extra className="grid gap-2">
                {current.extra}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid place-items-center">
          <Pila mood="neutral" size={140} />
        </div>
      )}

      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] sm:px-8">
        <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0} aria-label="Tela anterior">
          <ChevronLeft />
          Voltar
        </Button>
        {last ? (
          <Button variant="primary" className="min-h-12 px-6 text-base" onClick={close}>
            Ir para o ciclo novo
          </Button>
        ) : (
          <Button variant="primary" className="min-h-12 px-6 text-base" onClick={() => setStep(step + 1)} disabled={!current}>
            Próximo
            <ChevronRight />
          </Button>
        )}
      </div>
    </div>
  );
}

type Slide = {
  mood: PilaMood;
  eyebrow?: string;
  /** Título grande, sobe letra a letra (texto puro, por causa do SplitText) */
  title?: string;
  /** Valor gigante que conta do zero */
  value?: number;
  tone?: "pos" | "neg";
  note?: ReactNode;
  extra?: ReactNode;
  rain?: boolean;
};

/** Linha com barra (maiores gastos, precisava × vontade) */
const BarRow = ({ lead, label, value, share, color }: { lead?: ReactNode; label: string; value: string; share: number; color: string }) => (
  <div className="grid gap-1.5 rounded-control bg-surface-2 px-4 py-3">
    <div className="flex items-center gap-3">
      {lead}
      <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
      <span className="font-medium tabular">{value}</span>
    </div>
    <span className="h-2 overflow-hidden rounded-full bg-background">
      <span data-bar className="block h-full rounded-full" style={{ width: `${Math.max(4, share * 100)}%`, background: color }} />
    </span>
  </div>
);

function buildSlides({ summary: s, categories, merchants, catalog, needs }: RecapData, key: string): Slide[] {
  const name = cycleName(key);
  const f = s.flow;
  const keyById = new Map(catalog.map((c) => [c.id, c]));
  const top = [...categories].filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 3);
  const topMerchant = merchants[0];
  const spentTotal = f.spent + f.card_bills;

  if (s.income === 0 && s.expense === 0) {
    return [
      {
        mood: "sleep",
        eyebrow: `Fechamento de ${name}`,
        title: "Fechou sem movimento.",
        note: "Quando os bancos trouxerem transações, eu conto aqui como foi cada ciclo.",
      },
    ];
  }

  const slides: Slide[] = [
    {
      mood: "neutral",
      eyebrow: `Fechamento · ${cycleRange(s.cycle)}`,
      title: `O ciclo de ${name} fechou.`,
      note: "Separei o que importa em poucas telas. Dá para pular quando quiser (Esc).",
    },
    {
      mood: "happy",
      eyebrow: "Entrou na conta",
      value: f.income,
      note: "Salário, Pix recebidos e outras receitas do ciclo.",
    },
    {
      mood: "neutral",
      eyebrow: "Saiu, contando as faturas",
      value: spentTotal,
      note: topMerchant ? (
        <>
          Onde mais comprou: <strong className="text-foreground">{topMerchant.name}</strong>, {money(topMerchant.total)} em{" "}
          {topMerchant.count} {topMerchant.count === 1 ? "compra" : "compras"}.
        </>
      ) : undefined,
      extra: top.length
        ? top.map((c) => {
            const cat = c.category_id ? keyById.get(c.category_id) : undefined;
            return (
              <BarRow
                key={c.category_id ?? "none"}
                lead={<CategoryIcon categoryKey={cat?.key} kind={cat?.kind ?? "EXPENSE"} />}
                label={c.category_name}
                value={money(c.spent)}
                share={c.spent / top[0].spent}
                color="var(--accent)"
              />
            );
          })
        : undefined,
    },
  ];

  // Precisava × vontade: só quando o jogo tem cartas jogadas neste ciclo
  if (needs && needs.want_share !== null) {
    const total = needs.need + needs.want;
    slides.push({
      mood: needs.want_share > 0.4 ? "worried" : "happy",
      eyebrow: "Precisava ou foi vontade?",
      title: `${percent(needs.want_share)} foi vontade.`,
      note:
        needs.half_want > 0 ? (
          <>
            Cortando metade da vontade, sobrariam <strong className="text-foreground">{money(needs.half_want)}</strong> por ciclo.
          </>
        ) : undefined,
      extra: (
        <>
          <BarRow label="Precisava" value={money(needs.need)} share={needs.need / total} color="var(--cat-home)" />
          <BarRow label="Foi vontade" value={money(needs.want)} share={needs.want / total} color="var(--negative)" />
        </>
      ),
    });
  }

  slides.push(
    f.saved > 0
      ? {
          mood: "happy",
          eyebrow: "Foi para os cofrinhos",
          value: f.saved,
          note: "Aportes menos resgates no ciclo.",
        }
      : {
          mood: "neutral",
          eyebrow: "Cofrinhos",
          title: "Neste ciclo nada foi guardado.",
          note: "Uma meta de guardar na Previsão do ciclo ajuda o próximo a separar um pouco.",
        },
  );

  slides.push(
    f.result >= 0
      ? {
          mood: "celebrate",
          rain: true,
          eyebrow: "Fechou no azul",
          value: f.result,
          tone: "pos",
          note: `Entrou mais do que saiu no ciclo de ${name}.`,
        }
      : {
          mood: "worried",
          eyebrow: "Saiu mais do que entrou",
          value: f.result,
          tone: "neg",
          note: "Ficou nesse valor no vermelho. Os orçamentos ajudam a segurar o próximo ciclo.",
        },
  );
  return slides;
}
