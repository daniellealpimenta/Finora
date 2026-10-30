"use client";

import { Gamepad2, Scale } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Card, CardTitle, Pill } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { cycleName } from "@/lib/cycle";
import { money, percent } from "@/lib/format";
import { FULL, gsap, useGSAP } from "@/lib/motion";
import { NeedsGame } from "./game";
import type { NeedsSummary } from "./types";

const INFO = (
  <>
    Cada gasto do ciclo vira uma carta no jogo &quot;Precisava ou foi vontade?&quot;. O índice é a parte
    do que você já classificou que foi vontade. Cortando metade dela, sobra o valor indicado por ciclo.
  </>
);

/** Índice "Precisava × vontade" (services/needs.py) e a porta de entrada do jogo. */
export function NeedsCard({ month }: { month: string }) {
  const [s, setS] = useState<NeedsSummary | null>(null);
  const [playing, setPlaying] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<NeedsSummary>(`/needs/summary${qs({ month })}`)
      .then(setS)
      .catch(() => setS(null));
  }, [month]);
  useEffect(load, [load]);
  const closeGame = useCallback(
    (changed: boolean) => {
      setPlaying(false);
      if (changed) load();
    },
    [load],
  );

  // A balança: as duas partes crescem da divisória; o histórico sobe em cascata
  useGSAP(
    () => {
      if (!s) return;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-need]", { scaleX: 0, transformOrigin: "right", duration: 0.9, ease: "power3.out" });
        gsap.from("[data-want]", { scaleX: 0, transformOrigin: "left", duration: 0.9, ease: "power3.out" });
        gsap.from("[data-hist]", { scaleY: 0, transformOrigin: "bottom", stagger: 0.06, duration: 0.6, ease: "back.out(2)" });
        gsap.from("[data-share]", { textContent: 0, snap: { textContent: 1 }, duration: 1, ease: "power2.out" });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [s], revertOnUpdate: true },
  );

  const share = s?.want_share ?? null;
  const classified = s ? s.need + s.want : 0;
  const trend = share !== null && s?.previous_want_share != null ? share - s.previous_want_share : null;

  return (
    <div ref={root} className="grid">
    <Card data-enter>
      <CardTitle icon={Scale} color="var(--cat-shop)" info={INFO} hint={s && s.open_count > 0 ? `${s.open_count} para jogar` : undefined}>
        Precisava × vontade
      </CardTitle>
      {!s ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : share === null ? (
        <div className="grid justify-items-start gap-3">
          <p className="max-w-[46ch] text-sm text-muted">
            Jogue os gastos de {cycleName(month)} para um lado ou para o outro e descubra quanto do ciclo foi
            escolha.
          </p>
          {s.open_count > 0 && (
            <Button variant="primary" onClick={() => setPlaying(true)}>
              <Gamepad2 />
              Jogar ({s.open_count} cartas)
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label">Foi vontade</p>
              <p className="font-display text-[44px] leading-none tracking-[-0.02em] tabular">
                <span data-share>{Math.round(share * 100)}</span>
                <span className="text-[0.45em] text-muted">%</span>
              </p>
            </div>
            {trend !== null && Math.abs(trend) >= 0.01 && (
              <Pill status={trend > 0 ? "warn" : "ok"}>
                {trend > 0 ? "▲" : "▼"} {percent(Math.abs(trend))} vs. ciclo anterior
              </Pill>
            )}
          </div>

          <div className="grid gap-1.5">
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
              <span data-need className="h-full bg-[var(--cat-home)]" style={{ width: `${(s.need / classified) * 100}%` }} />
              <span data-want className="h-full bg-negative" style={{ width: `${(s.want / classified) * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs font-medium">
              <span className="text-[var(--cat-home)]">Precisava {money(s.need)}</span>
              <span className="text-negative">Vontade {money(s.want)}</span>
            </div>
          </div>

          {s.half_want > 0 && (
            <p className="text-sm">
              Cortando metade da vontade, sobrariam <strong className="text-positive">{money(s.half_want)}</strong> por
              ciclo.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {s.top_merchants.length > 0 && (
              <div className="grid gap-1.5">
                <p className="label">Onde a vontade mais pesou</p>
                {s.top_merchants.map((m) => (
                  <p key={m.name} className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 font-medium tabular">{money(m.amount)}</span>
                  </p>
                ))}
              </div>
            )}
            <div className="grid gap-1.5">
              <p className="label">Vontade nos últimos ciclos</p>
              <div className="flex h-16 items-end gap-1.5" aria-label="Parte que foi vontade, ciclo a ciclo">
                {s.history.map((h) => (
                  <span key={h.key} className="flex flex-1 flex-col items-center gap-1" title={`${cycleName(h.key)}: ${h.want_share === null ? "sem cartas jogadas" : percent(h.want_share)}`}>
                    <span
                      data-hist
                      className="w-full rounded-t-[4px] bg-negative"
                      style={{ height: `${Math.max(4, (h.want_share ?? 0) * 56)}px`, opacity: h.want_share === null ? 0.25 : 1 }}
                    />
                  </span>
                ))}
              </div>
            </div>
          </div>

          {s.open_count > 0 && (
            <Button className="justify-self-start" onClick={() => setPlaying(true)}>
              <Gamepad2 />
              Jogar mais {s.open_count} {s.open_count === 1 ? "carta" : "cartas"} ({money(s.open)})
            </Button>
          )}
        </div>
      )}
      {playing && <NeedsGame month={month} onClose={closeGame} />}
    </Card>
    </div>
  );
}
