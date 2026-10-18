"use client";

import { ArrowUpRight, CalendarClock, Gauge, HandHeart, PiggyBank, Repeat, SlidersHorizontal, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { Dialog } from "@/components/dialog";
import { Button, Card, CardTitle, ErrorNote, STATUS_COLOR, StatusShape, cx, inputClass, tone, type Status } from "@/components/ui";
import { api } from "@/lib/api";
import { cycleName } from "@/lib/cycle";
import { money, percent, shiftMonth, shortDate } from "@/lib/format";
import { HeroRow } from "./cards";
import { INFO_FORECAST } from "./info";
import type { Forecast, Planning } from "./types";

const ago = (iso: string | null) => (iso ? `por volta de ${shortDate(iso)}` : "ainda não caiu");

type View = "day" | "total";
const VIEW_KEY = "mf_previsao_visao";

/** Por dia ou no total: preferência deste navegador. */
function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>("day");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "total") setView("total");
    } catch {
      /* sem storage: fica por dia */
    }
  }, []);
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {
        /* vale só nesta aba */
      }
    },
  ];
}

export function ForecastCard({ data, onChanged }: { data: Forecast; onChanged: () => void }) {
  const [adjusting, setAdjusting] = useState(false);
  const [view, setView] = useView();
  const f = data;
  const end = f.cycle.end;
  const pending = f.incomes.filter((i) => i.counted && Number(i.remaining) > 0);
  const allowance = f.daily_allowance === null ? null : Number(f.daily_allowance);
  // Total para o dia a dia; sem o campo (dados de antes de ele existir), por dia × dias
  const spendable = f.spendable !== undefined ? Number(f.spendable) : (allowance ?? 0) * f.days_left;
  const typical = Number(f.daily_typical);
  // Fechar negativo = gastar mais por dia do que dá (as duas contas são a mesma); apertado =
  // menos de 10% de folga sobre o seu ritmo
  const status: Status =
    Number(f.forecast_end) < 0 ? "bad" : allowance !== null && allowance < typical * 1.1 ? "warn" : "ok";
  const next = cycleName(shiftMonth(f.cycle.key, 1));

  return (
    <Card data-enter>
      <CardTitle
        icon={CalendarClock}
        color="var(--accent)"
        info={INFO_FORECAST}
        hint={
          <span className="flex items-center gap-2">
            <span>
              até {shortDate(end)}, {f.days_left === 1 ? "falta 1 dia" : `faltam ${f.days_left} dias`}
            </span>
            <Button variant="ghost" className="min-h-8 px-2.5 text-xs" onClick={() => setAdjusting(true)}>
              <SlidersHorizontal />
              Ajustar
            </Button>
          </span>
        }
      >
        Previsão do ciclo
      </CardTitle>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ul className="grid content-start divide-y divide-border" aria-label="Previsão do ciclo">
          <HeroRow icon={Wallet} color="var(--muted)" label="Livre agora" value={money(f.available_now)} note={<span className="text-muted">já aconteceu</span>} />
          {pending.map((i) => (
            <HeroRow
              key={i.key}
              icon={ArrowUpRight}
              color="var(--positive)"
              label={i.label}
              value={`+${money(i.remaining)}`}
              note={
                <span className="text-muted">
                  previsto, {ago(i.expected_date)}
                  {i.until ? `, conta até o ciclo de ${cycleName(i.until)}` : ""}
                </span>
              }
            />
          ))}
          {f.tithe.rate > 0 && (
            <HeroRow
              icon={HandHeart}
              color="var(--cat-shop)"
              label="Dízimo"
              value={`−${money(f.tithe.left)}`}
              note={
                <span className="text-muted">
                  {percent(f.tithe.rate)} de {money(f.tithe.base)}
                  {Number(f.tithe.given) > 0 ? `, ${money(f.tithe.given)} já dados` : ""}
                </span>
              }
            />
          )}
          {Number(f.savings.goal) > 0 && (
            <HeroRow
              icon={PiggyBank}
              color="var(--cat-care)"
              label="Cofrinho"
              value={`−${money(f.savings.left)}`}
              note={
                <span className="text-muted">
                  meta {money(f.savings.goal)}
                  {Number(f.savings.saved) > 0 ? `, ${money(f.savings.saved)} já guardados` : ""}
                </span>
              }
            />
          )}
          {Number(f.fixed_left) > 0 && (
            <HeroRow
              icon={Repeat}
              color="var(--cat-fun)"
              label="Contas fixas que faltam"
              value={`−${money(f.fixed_left)}`}
              note={<span className="text-muted">{f.fixed.map((x) => x.name.split("  ")[0]).join(", ")}</span>}
            />
          )}
          <HeroRow
            icon={Gauge}
            color="var(--cat-move)"
            label="Dia a dia"
            value={`−${money(f.variable_left)}`}
            note={
              <span className="text-muted">
                {money(f.daily_typical)}/dia × {f.days_left} dias, seu ritmo
              </span>
            }
          />
          <li className="flex items-center justify-between gap-3 py-3 last:pb-0">
            <span className="text-sm font-semibold">Previsão do fim do ciclo</span>
            <span className={cx("text-[17px] font-semibold tabular", Number(f.forecast_end) < 0 && "text-negative")}>
              ~{money(f.forecast_end)}
            </span>
          </li>
        </ul>

        <div className="grid content-start gap-4">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label uppercase">Dá para gastar no dia a dia</p>
              <div role="group" aria-label="Mostrar valor" className="inline-flex rounded-control bg-surface-2 p-0.5 text-xs font-semibold">
                {(
                  [
                    ["day", "Por dia"],
                    ["total", "No ciclo"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cx(
                      "min-h-8 rounded-[calc(var(--radius-control)-2px)] px-3 transition-colors duration-[var(--dur-fast)]",
                      view === v ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[clamp(32px,5vw,44px)] leading-tight font-light tracking-[-0.02em] tabular">
              {view === "total"
                ? money(Math.max(spendable, 0))
                : allowance === null
                  ? "—"
                  : money(Math.max(allowance, 0))}
              <span className="text-sm font-medium tracking-normal text-muted">
                {view === "total" ? ` até ${shortDate(end)}` : " /dia"}
              </span>
            </p>
            <p className="text-sm text-muted tabular">
              {view === "total"
                ? `${allowance === null ? "" : `${money(Math.max(allowance, 0))} por dia, `}`
                : `${money(Math.max(spendable, 0))} no total, `}
              para fechar o ciclo no zero, já separando dízimo, cofrinho e contas fixas.
            </p>
          </div>
          <p
            style={tone(STATUS_COLOR[status])}
            className="tint flex items-start gap-2 rounded-control px-3 py-2.5 text-sm leading-relaxed"
          >
            <StatusShape status={status} className="mt-1" />
            <span>
              {status === "bad" && (
                <>No seu ritmo ({money(typical)}/dia), o ciclo fecha negativo. Segure os gastos do dia a dia.</>
              )}
              {status === "warn" && (
                <>Está apertado: no seu ritmo de {money(typical)}/dia, sobra pouco no fim do ciclo.</>
              )}
              {status === "ok" && (
                <>Você costuma gastar {money(typical)}/dia: no seu ritmo, o ciclo fecha com folga.</>
              )}
            </span>
          </p>
          <p className="text-sm">
            O ciclo de {next} começaria com{" "}
            <strong className={cx("font-semibold tabular", Number(f.forecast_end) < 0 && "text-negative")}>
              ~{money(f.forecast_end)}
            </strong>
            .
          </p>
          <p className="text-xs text-muted">É uma estimativa pelo seu histórico. Cada valor previsto vira real quando acontece.</p>
        </div>
      </div>
      {adjusting && <PlanningDialog forecast={f} onClose={() => setAdjusting(false)} onSaved={onChanged} />}
    </Card>
  );
}

/** Dízimo, meta do cofrinho e até quando cada entrada fixa conta na previsão. */
function PlanningDialog({ forecast, onClose, onSaved }: { forecast: Forecast; onClose: () => void; onSaved: () => void }) {
  const [tithe, setTithe] = useState(String(Math.round(forecast.tithe.rate * 1000) / 10).replace(".", ","));
  const [goal, setGoal] = useState(String(Number(forecast.savings.goal)).replace(".", ","));
  const [rules, setRules] = useState(() =>
    Object.fromEntries(forecast.incomes.map((i) => [i.key, { until: i.until ?? "", ignore: i.ignored }])),
  );
  const [error, setError] = useState<string | null>(null);

  const num = (raw: string) => Number(raw.replace(/\./g, "").replace(",", ".").trim() || "0");

  return (
    <Dialog title="Ajustar previsão" onClose={onClose}>
      {(close) => (
        <form
          className="grid gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const rate = num(tithe) / 100;
            const savings = num(goal);
            if (Number.isNaN(rate) || rate < 0 || rate > 1 || Number.isNaN(savings) || savings < 0) {
              setError("Use números: dízimo entre 0 e 100%, cofrinho a partir de 0.");
              return;
            }
            try {
              const current = await api<Planning>("/planning");
              const incomes = { ...current.incomes };
              for (const [key, r] of Object.entries(rules)) incomes[key] = { until: r.until || null, ignore: r.ignore };
              await api("/planning", {
                method: "PUT",
                body: JSON.stringify({ tithe_rate: rate, savings_goal: savings, incomes }),
              });
              close(() => {
                onClose();
                onSaved();
              });
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="label">Dízimo (% das entradas + o que sobrou)</span>
              <input inputMode="decimal" className={cx(inputClass, "tabular")} value={tithe} onChange={(e) => setTithe(e.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="label">Guardar no cofrinho por ciclo (R$)</span>
              <input inputMode="decimal" className={cx(inputClass, "tabular")} value={goal} onChange={(e) => setGoal(e.target.value)} />
            </label>
          </div>
          {forecast.incomes.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="label mb-1">Entradas fixas encontradas no seu histórico</legend>
              {forecast.incomes.map((i) => {
                const r = rules[i.key];
                return (
                  <div key={i.key} className="grid gap-2 rounded-control border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <label className="flex items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--accent)]"
                        checked={!r.ignore}
                        onChange={() => setRules({ ...rules, [i.key]: { ...r, ignore: !r.ignore } })}
                      />
                      <span>
                        <span className="font-medium">{i.label}</span>{" "}
                        <span className="text-muted tabular">~{money(i.expected)} por ciclo</span>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      Conta até o ciclo de
                      <input
                        type="month"
                        className={cx(inputClass, "min-h-9 text-xs")}
                        value={r.until}
                        disabled={r.ignore}
                        onChange={(e) => setRules({ ...rules, [i.key]: { ...r, until: e.target.value } })}
                      />
                    </label>
                  </div>
                );
              })}
              <p className="text-xs text-muted">Deixe a data em branco para contar sempre.</p>
            </fieldset>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => close()}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Salvar
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
