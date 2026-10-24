"use client";

import {
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  HandHeart,
  PiggyBank,
  Repeat,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Dialog } from "@/components/dialog";
import {
  Button,
  Card,
  CardTitle,
  ErrorNote,
  STATUS_COLOR,
  StatusShape,
  cx,
  inputClass,
  tone,
  type Status,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cycleName } from "@/lib/cycle";
import { money, percent, shortDate } from "@/lib/format";
import { HeroRow } from "./cards";
import { INFO_FORECAST } from "./info";
import type { Forecast, Planning } from "./types";

const ago = (iso: string | null) => (iso ? `por volta de ${shortDate(iso)}` : "ainda não caiu");
// Rótulos de banco vêm com espaços de preenchimento e "*" ("APP    *VOXOWA")
const short = (name: string) => name.replace(/\s*\*\s*/g, " ").replace(/\s+/g, " ").trim();

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
  const spendable = Number(f.spendable);
  const typical = Number(f.daily_typical);
  const extra = Number(f.forecast_end);
  const s = f.savings;
  const goal = Number(s.goal);
  const cycleIncome = Number(f.cycle_income);
  // No seu ritmo: guardado no cofrinho + o que falta da meta + a folga além dela
  const wouldSave = Number(s.saved) + Number(s.left) + extra;
  const status: Status = spendable < 0 ? "bad" : extra < 0 ? "warn" : "ok";
  const goalNote =
    s.mode === "rate"
      ? `${percent(s.rate)} de ${money(cycleIncome)} que entram no ciclo`
      : "valor fixo por ciclo";
  const u = f.until_income;
  // Só vale mostrar se a próxima entrada cai antes do fim do ciclo
  const untilStatus: Status | null = u
    ? Number(u.free) < 0
      ? "bad"
      : Number(u.daily) < typical
        ? "warn"
        : "ok"
    : null;

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
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ul className="grid content-start divide-y divide-border" aria-label="Conta da previsão">
          <HeroRow
            icon={Wallet}
            color="var(--muted)"
            label="Livre agora"
            value={money(f.available_now)}
            note={<span className="text-muted">já aconteceu</span>}
          />
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
          {Number(f.fixed_left) > 0 && (
            <HeroRow
              icon={Repeat}
              color="var(--cat-fun)"
              label="Contas fixas que faltam"
              value={`−${money(f.fixed_left)}`}
              note={<span className="text-muted">{f.fixed.map((x) => short(x.name)).join(", ")}</span>}
            />
          )}
          {Number(f.installments_left) > 0 && (
            <HeroRow
              icon={CreditCard}
              color="var(--cat-move)"
              label="Parcelas que faltam"
              value={`−${money(f.installments_left)}`}
              note={<span className="text-muted">{f.installments.map((x) => short(x.name)).join(", ")}</span>}
            />
          )}
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
          {goal > 0 && (
            <HeroRow
              icon={PiggyBank}
              color="var(--cat-care)"
              label="Meta de guardar"
              value={`−${money(s.left)}`}
              note={
                <span className="text-muted">
                  {money(goal)}: {goalNote}
                  {Number(s.saved) > 0 ? `, ${money(s.saved)} já guardados` : ""}
                </span>
              }
            />
          )}
          <li className="flex items-center justify-between gap-3 py-3 last:pb-0">
            <span className="text-sm font-semibold">Dá para gastar no dia a dia</span>
            <span className={cx("text-[17px] font-semibold tabular", spendable < 0 && "text-negative")}>
              {money(spendable)}
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
                      view === v ? "bg-surface text-foreground" : "text-muted hover:text-foreground",
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
                ? allowance === null
                  ? ""
                  : `${money(Math.max(allowance, 0))} por dia, `
                : `${money(Math.max(spendable, 0))} até ${shortDate(end)}, `}
              {goal > 0 ? `já guardando ${money(goal)} (${s.mode === "rate" ? `${percent(s.rate)} do que entra` : "sua meta"}).` : "sem meta de guardar."}
            </p>
          </div>

          {u && untilStatus && (
            <div style={tone(STATUS_COLOR[untilStatus])} className="grid gap-1 rounded-control border border-border px-3 py-2.5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <StatusShape status={untilStatus} className="text-[var(--c)]" />
                Até {u.label === "Salário" ? "o salário" : u.label} ({shortDate(u.date)}, em{" "}
                {u.days === 1 ? "1 dia" : `${u.days} dias`})
              </p>
              <p className="pl-5 text-sm text-muted tabular">
                <strong className={cx("font-semibold text-foreground", Number(u.free) < 0 && "text-negative")}>
                  {money(u.free)} livres
                </strong>
                {Number(u.free) > 0 && `, ${money(u.daily)} por dia`}
                {Number(u.fixed_before) > 0 && `, já tirando ${money(u.fixed_before)} de contas que vencem antes`}.
                {untilStatus === "bad" && " O dinheiro de agora não cobre o que vence antes da entrada."}
                {untilStatus === "warn" && ` Menos do que o seu ritmo de ${money(typical)}/dia: segure até lá.`}
              </p>
            </div>
          )}

          <p
            style={tone(STATUS_COLOR[status])}
            className="tint flex items-start gap-2 rounded-control px-3 py-2.5 text-sm leading-relaxed"
          >
            <StatusShape status={status} className="mt-1" />
            <span>
              {status === "bad" && (
                <>
                  Mesmo sem gastos no dia a dia, as contas previstas não deixam cumprir a meta: faltam{" "}
                  {money(-spendable)}.
                </>
              )}
              {status === "warn" && (
                <>
                  No seu ritmo ({money(typical)}/dia), o dia a dia come {money(-extra)} da meta de guardar. Segure
                  um pouco até {shortDate(end)}.
                </>
              )}
              {status === "ok" && (
                <>
                  No seu ritmo ({money(typical)}/dia), você gasta ~{money(f.variable_left)} e ainda sobram{" "}
                  ~{money(extra)} além da meta.
                </>
              )}
            </span>
          </p>
          {cycleIncome > 0 && (
            <p className="text-sm">
              Nesse ritmo, você guardaria{" "}
              <strong className={cx("font-semibold tabular", wouldSave < 0 && "text-negative")}>
                ~{money(wouldSave)}
              </strong>{" "}
              neste ciclo ({percent(wouldSave / cycleIncome)} do que entra)
              {s.history_rate !== null ? `; nos 3 últimos ciclos foram ${percent(s.history_rate)}.` : "."}
            </p>
          )}
          <p className="text-xs text-muted">É uma estimativa pelo seu histórico. Cada valor previsto vira real quando acontece.</p>
        </div>
      </div>
      {adjusting && <PlanningDialog forecast={f} onClose={() => setAdjusting(false)} onSaved={onChanged} />}
    </Card>
  );
}

const pct = (rate: number) => String(Math.round(rate * 1000) / 10).replace(".", ",");
const num = (raw: string) => Number(raw.replace(/\./g, "").replace(",", ".").trim() || "0");

/** Meta de guardar, dízimo e até quando cada entrada fixa conta na previsão. */
function PlanningDialog({ forecast, onClose, onSaved }: { forecast: Forecast; onClose: () => void; onSaved: () => void }) {
  const s = forecast.savings;
  const [mode, setMode] = useState(s.mode);
  const [rate, setRate] = useState(pct(s.rate));
  const [amount, setAmount] = useState(s.mode === "amount" ? String(Number(s.goal)).replace(".", ",") : "");
  const [tithe, setTithe] = useState(pct(forecast.tithe.rate));
  const [rules, setRules] = useState(() =>
    Object.fromEntries(forecast.incomes.map((i) => [i.key, { until: i.until ?? "", ignore: i.ignored }])),
  );
  const [error, setError] = useState<string | null>(null);
  const income = Number(forecast.cycle_income);
  const preview = mode === "rate" ? (num(rate) / 100) * income : num(amount);

  return (
    <Dialog title="Ajustar previsão" size="lg" onClose={onClose}>
      {(close) => (
        <form
          className="grid gap-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const savingsRate = num(rate) / 100;
            const savingsGoal = num(amount);
            const titheRate = num(tithe) / 100;
            const bad = (v: number, max = Infinity) => Number.isNaN(v) || v < 0 || v > max;
            if (bad(savingsRate, 1) || bad(titheRate, 1) || (mode === "amount" && bad(savingsGoal))) {
              setError("Use números: percentuais entre 0 e 100, valores a partir de 0.");
              return;
            }
            try {
              const current = await api<Planning>("/planning");
              const incomes = { ...current.incomes };
              for (const [key, r] of Object.entries(rules)) incomes[key] = { until: r.until || null, ignore: r.ignore };
              await api("/planning", {
                method: "PUT",
                body: JSON.stringify({
                  tithe_rate: titheRate,
                  savings_mode: mode,
                  savings_rate: savingsRate,
                  savings_goal: mode === "amount" ? savingsGoal : Number(current.savings_goal ?? 0),
                  incomes,
                }),
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
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-semibold">Meta de guardar por ciclo</legend>
            <div role="radiogroup" aria-label="Tipo de meta" className="inline-flex w-fit rounded-control bg-surface-2 p-0.5 text-sm font-semibold">
              {(
                [
                  ["rate", "% do que entra"],
                  ["amount", "Valor fixo"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={mode === v}
                  onClick={() => setMode(v)}
                  className={cx(
                    "min-h-9 rounded-[calc(var(--radius-control)-2px)] px-3.5 transition-colors duration-[var(--dur-fast)]",
                    mode === v ? "bg-surface text-foreground" : "text-muted hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative">
                <span className="sr-only">{mode === "rate" ? "Percentual" : "Valor em reais"}</span>
                {mode === "amount" && (
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">R$</span>
                )}
                <input
                  inputMode="decimal"
                  className={cx(inputClass, "w-36 tabular", mode === "rate" ? "pr-8" : "pl-9")}
                  value={mode === "rate" ? rate : amount}
                  onChange={(e) => (mode === "rate" ? setRate(e.target.value) : setAmount(e.target.value))}
                />
                {mode === "rate" && (
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">%</span>
                )}
              </label>
              {!Number.isNaN(preview) && income > 0 && (
                <span className="text-sm text-muted tabular">
                  = {money(preview)} neste ciclo
                  {mode === "amount" ? ` (${percent(preview / income)} do que entra)` : ""}
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Sugestão: 20% (regra 50/30/20).
              {s.history_rate !== null && ` Nos 3 últimos ciclos você guardou ${percent(s.history_rate)}.`} Conta o que vai
              para o cofrinho e o que sobra na conta no fim do ciclo.
            </p>
          </fieldset>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">Dízimo</span>
            <span className="relative w-fit">
              <input
                inputMode="decimal"
                className={cx(inputClass, "w-36 pr-8 tabular")}
                value={tithe}
                onChange={(e) => setTithe(e.target.value)}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">%</span>
            </span>
            <span className="text-xs text-muted">Sobre o que sobrou do ciclo anterior mais o que entra. 0 desliga.</span>
          </label>

          {forecast.incomes.length > 0 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-semibold">Entradas fixas encontradas no seu histórico</legend>
              {forecast.incomes.map((i) => {
                const r = rules[i.key];
                return (
                  <div key={i.key} className="grid gap-2.5 rounded-control border border-border p-3">
                    <label className="flex items-start gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                        checked={!r.ignore}
                        onChange={() => setRules({ ...rules, [i.key]: { ...r, ignore: !r.ignore } })}
                      />
                      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium">{i.label}</span>
                        <span className="text-muted tabular">~{money(i.expected)} por ciclo</span>
                      </span>
                    </label>
                    <label className="flex flex-wrap items-center gap-2 pl-6.5 text-xs text-muted">
                      Conta até o ciclo de
                      <input
                        type="month"
                        className={cx(inputClass, "min-h-9 text-xs")}
                        value={r.until}
                        disabled={r.ignore}
                        onChange={(e) => setRules({ ...rules, [i.key]: { ...r, until: e.target.value } })}
                      />
                      <span>{r.until ? "" : "(em branco: sempre)"}</span>
                    </label>
                  </div>
                );
              })}
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
