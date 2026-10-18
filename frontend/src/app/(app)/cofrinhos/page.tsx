"use client";

import { Pencil, PiggyBank, Plus, Sparkles, Trash2, TrendingUp, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Dialog } from "@/components/dialog";
import { Pila, PilaSays } from "@/components/pila";
import {
  Button,
  Card,
  CardTitle,
  ErrorNote,
  IconBadge,
  IconButton,
  Meter,
  PageHeader,
  Pill,
  cx,
  inputClass,
} from "@/components/ui";
import { api, type Investment, type SavingsPot } from "@/lib/api";
import { earnedText, money, percent } from "@/lib/format";
import { usePageEnter } from "@/lib/motion";
import { notify } from "@/lib/signals";

const POT_COLOR = "var(--cat-care)";

/** "1.234,56" ou "1234.56" -> número; vazio -> null; inválido -> NaN. */
function parseMoney(raw: string): number | null {
  const clean = raw.replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return clean === "" ? null : Number(clean);
}

const fullDate = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "";

const rateText = (i: Investment) =>
  i.rate && i.rate_type ? `${Number(i.rate).toLocaleString("pt-BR")}% do ${i.rate_type}` : (i.subtype ?? i.type);

export default function CofrinhosPage() {
  const [pots, setPots] = useState<SavingsPot[] | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<SavingsPot | null>(null);
  const root = useRef<HTMLDivElement>(null);

  usePageEnter(root, pots !== null);

  const load = useCallback(async () => {
    const [p, inv] = await Promise.all([api<SavingsPot[]>("/pots"), api<Investment[]>("/investments")]);
    setPots(p);
    setInvestments(inv);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function run(action: () => Promise<unknown>, message?: string) {
    try {
      await action();
      setError(null);
      await load();
      if (message) notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const updatePot = (pot: SavingsPot, body: { name?: string; goal_amount?: number | null }, message: string) =>
    run(() => api(`/pots/${pot.id}`, { method: "PATCH", body: JSON.stringify(body) }), message);

  const move = (inv: Investment, potId: number | null) =>
    run(
      () => api(`/investments/${inv.id}`, { method: "PATCH", body: JSON.stringify({ pot_id: potId }) }),
      potId === null ? "Aplicação tirada do cofrinho." : `Movida para ${pots?.find((p) => p.id === potId)?.name}.`,
    );

  const total = investments.reduce((sum, i) => sum + Number(i.balance), 0);
  const applied = investments.reduce((sum, i) => sum + Number(i.amount_original ?? i.balance), 0);
  const loose = investments.filter((i) => i.pot_id === null);
  const list = pots ?? [];

  return (
    <div ref={root}>
      <PageHeader
        title="Cofrinhos"
        description="O Open Finance não manda o nome dos seus cofrinhos, e cada depósito chega como uma aplicação separada. Agrupei pela taxa: renomeie, mova as aplicações e defina metas."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus />
            Novo cofrinho
          </Button>
        }
      />

      <div className="grid gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {pots && investments.length === 0 && (
          <Card data-enter className="grid justify-items-center gap-4 py-10 text-center">
            <Pila mood="sleep" size={120} />
            <p className="max-w-md text-sm text-muted">
              Nenhuma aplicação ainda. Sincronize em Contas. Se continuar vazio, o banco não compartilhou
              investimentos: no MeuPluggy, autorize &quot;Investimentos&quot; ao conectar.
            </p>
          </Card>
        )}

        {investments.length > 0 && (
          <div data-enter className="grid gap-3 sm:grid-cols-3">
            <Total icon={PiggyBank} color={POT_COLOR} label="Guardado" value={money(total)} />
            <Total
              icon={TrendingUp}
              color="var(--positive)"
              label="Já rendeu"
              value={`${total - applied >= 0 ? "+" : "−"}${money(Math.abs(total - applied))}`}
            />
            <Total icon={Wallet} color="var(--cat-home)" label="Cofrinhos" value={String(list.length)} />
          </div>
        )}

        {list.length > 0 && <YieldList pots={list} investments={investments} />}

        {list.map((pot) => (
          <PotCard
            key={pot.id}
            pot={pot}
            pots={list}
            items={investments.filter((i) => i.pot_id === pot.id)}
            onRename={(name) => updatePot(pot, { name }, "Cofrinho renomeado.")}
            onGoal={(goal) =>
              updatePot(pot, { goal_amount: goal }, goal === null ? "Meta removida." : `Meta de ${pot.name} salva.`)
            }
            onMove={move}
            onRemove={() => setRemoving(pot)}
          />
        ))}

        {loose.length > 0 && (
          <Card data-enter className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <IconBadge icon={Sparkles} color="var(--muted)" />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Sem cofrinho</h2>
                <p className="text-xs text-muted">Escolha para onde cada aplicação vai.</p>
              </div>
              <p className="text-lg font-light tabular">
                {money(loose.reduce((sum, i) => sum + Number(i.balance), 0))}
              </p>
            </div>
            <Applications items={loose} pots={list} onMove={move} />
          </Card>
        )}
      </div>

      {creating && (
        <PotDialog
          onClose={() => setCreating(false)}
          onSave={(name, goal) =>
            run(
              () => api("/pots", { method: "POST", body: JSON.stringify({ name, goal_amount: goal }) }),
              `Cofrinho ${name} criado.`,
            )
          }
        />
      )}

      {removing && (
        <Dialog title={`Apagar ${removing.name}?`} onClose={() => setRemoving(null)}>
          {(close) => (
            <div className="grid gap-5">
              <p className="text-sm text-muted">
                Só o cofrinho some daqui. As aplicações continuam no banco e vão para &quot;Sem cofrinho&quot;;
                nada é resgatado.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => close()}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const pot = removing;
                    close(() => {
                      setRemoving(null);
                      run(() => api(`/pots/${pot.id}`, { method: "DELETE" }), `${pot.name} apagado.`);
                    });
                  }}
                >
                  <Trash2 />
                  Apagar cofrinho
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

function Total({ icon, color, label, value }: { icon: typeof PiggyBank; color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-card-edge bg-surface px-4 py-3">
      <IconBadge icon={icon} color={color} size="sm" />
      <span className="text-sm text-muted">{label}</span>
      <span className="ml-auto text-[17px] font-medium tabular">{value}</span>
    </div>
  );
}

/** Quanto cada cofrinho rendeu: aplicado, saldo de hoje e a diferença. */
function YieldList({ pots, investments }: { pots: SavingsPot[]; investments: Investment[] }) {
  const rows = [...pots].sort((a, b) => Number(b.earned) - Number(a.earned));
  // Taxa do cofrinho: a das aplicações dele, quando todas têm a mesma
  const rateOf = (pot: SavingsPot) => {
    const rates = new Set(investments.filter((i) => i.pot_id === pot.id).map(rateText));
    return rates.size === 1 ? [...rates][0] : rates.size > 1 ? "taxas variadas" : "";
  };
  return (
    <Card data-enter>
      <CardTitle
        icon={TrendingUp}
        color="var(--positive)"
        hint="rendimento bruto, antes do IR"
        info={
          <>
            <p>
              <strong>Rendeu</strong> = saldo de hoje − valor aplicado, somando as aplicações de cada cofrinho. O
              percentual é sobre o valor aplicado.
            </p>
            <p>
              É o rendimento bruto informado pelo banco: o Imposto de Renda e o IOF só são descontados quando você
              resgata.
            </p>
            <p className="text-muted">Aplicações sem valor aplicado informado pelo banco contam com rendimento zero.</p>
          </>
        }
      >
        Rendimento por cofrinho
      </CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1.5 font-medium">Cofrinho</th>
              <th className="hidden py-1.5 text-right font-medium sm:table-cell">Aplicado</th>
              <th className="hidden py-1.5 text-right font-medium sm:table-cell">Saldo</th>
              <th className="py-1.5 text-right font-medium">Rendeu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => {
              const earned = Number(p.earned);
              const rate = rateOf(p);
              return (
                <tr key={p.id}>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted">
                      {rate}
                      <span className="sm:hidden">
                        {rate ? ", " : ""}
                        {money(p.applied)} aplicados
                      </span>
                    </p>
                  </td>
                  <td className="hidden py-2.5 text-right sm:table-cell">{money(p.applied)}</td>
                  <td className="hidden py-2.5 text-right sm:table-cell">{money(p.balance)}</td>
                  <td
                    className={cx(
                      "py-2.5 text-right font-semibold whitespace-nowrap",
                      earned > 0 ? "text-positive" : earned < 0 ? "text-negative" : "text-muted",
                    )}
                  >
                    {earnedText(p.earned, p.applied)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PotCard({
  pot,
  pots,
  items,
  onRename,
  onGoal,
  onMove,
  onRemove,
}: {
  pot: SavingsPot;
  pots: SavingsPot[];
  items: Investment[];
  onRename: (name: string) => Promise<void>;
  onGoal: (goal: number | null) => Promise<void>;
  onMove: (inv: Investment, potId: number | null) => Promise<void>;
  onRemove: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(pot.name);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [goalError, setGoalError] = useState<string | null>(null);
  const balance = Number(pot.balance);
  const goal = pot.goal_amount ? Number(pot.goal_amount) : null;
  const done = goal !== null && balance >= goal;

  return (
    <Card data-enter className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <IconBadge icon={PiggyBank} color={POT_COLOR} />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (name.trim()) await onRename(name.trim());
                setRenaming(false);
              }}
            >
              <label htmlFor={`pot-name-${pot.id}`} className="sr-only">
                Nome do cofrinho
              </label>
              <input
                id={`pot-name-${pot.id}`}
                autoFocus
                maxLength={100}
                className={cx(inputClass, "min-h-9 w-56")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" variant="primary" className="min-h-9">
                Salvar
              </Button>
              <Button type="button" variant="ghost" className="min-h-9" onClick={() => setRenaming(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <h2 className="flex items-center gap-1 font-semibold">
              <span className="truncate">{pot.name}</span>
              <IconButton label={`Renomear ${pot.name}`} onClick={() => setRenaming(true)}>
                <Pencil />
              </IconButton>
            </h2>
          )}
          <p className="text-xs text-muted">
            {pot.investments} {pot.investments === 1 ? "aplicação" : "aplicações"}
            {Number(pot.earned) !== 0 && (
              <>
                {", rendeu "}
                <span className={cx("font-semibold tabular", Number(pot.earned) > 0 && "text-positive")}>
                  {earnedText(pot.earned, pot.applied)}
                </span>
              </>
            )}
          </p>
        </div>
        <p className="text-[28px] leading-tight font-light tracking-[-0.02em] tabular">{money(balance)}</p>
        <IconButton label={`Apagar ${pot.name}`} onClick={onRemove}>
          <Trash2 />
        </IconButton>
      </div>

      <div className="grid gap-2">
        {goal !== null && (
          <Meter value={balance / goal} color={POT_COLOR} label={`${percent(balance / goal)} da meta`} />
        )}
        {editingGoal ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const value = parseMoney(goalDraft);
              if (value !== null && (Number.isNaN(value) || value < 0)) {
                setGoalError("Use só números, como 3000 ou 3.000,00.");
                return;
              }
              await onGoal(value);
              setGoalError(null);
              setEditingGoal(false);
            }}
          >
            <label htmlFor={`pot-goal-${pot.id}`} className="text-sm text-muted">
              Meta
            </label>
            <input
              id={`pot-goal-${pot.id}`}
              autoFocus
              inputMode="decimal"
              placeholder="sem meta"
              className={cx(inputClass, "min-h-9 w-36 text-right tabular")}
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
            />
            <Button type="submit" variant="primary" className="min-h-9">
              Salvar
            </Button>
            <Button type="button" variant="ghost" className="min-h-9" onClick={() => setEditingGoal(false)}>
              Cancelar
            </Button>
            {goalError && <p className="w-full text-xs font-semibold text-negative">{goalError}</p>}
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {done ? (
              <Pill status="ok">Meta atingida</Pill>
            ) : (
              <span className="text-sm text-muted tabular">
                {goal !== null
                  ? `${percent(balance / goal)} de ${money(goal)}, faltam ${money(goal - balance)}`
                  : "Sem meta"}
              </span>
            )}
            <button
              type="button"
              className="rounded-chip px-2 py-1 text-sm font-semibold text-accent hover:bg-surface-2"
              onClick={() => {
                setGoalDraft(goal ? String(goal).replace(".", ",") : "");
                setEditingGoal(true);
              }}
            >
              {goal !== null ? "Editar meta" : "Definir meta"}
            </button>
          </div>
        )}
        {done && (
          <PilaSays mood="happy" size={72} coin>
            {pot.name} bateu a meta!
          </PilaSays>
        )}
      </div>

      {items.length > 0 && <Applications items={items} pots={pots} onMove={onMove} />}
    </Card>
  );
}

/** Aplicações de um cofrinho: reconhecidas pela data, valor aplicado e taxa. */
function Applications({
  items,
  pots,
  onMove,
}: {
  items: Investment[];
  pots: SavingsPot[];
  onMove: (inv: Investment, potId: number | null) => Promise<void>;
}) {
  return (
    <details className="group rounded-control bg-surface-2/60 open:bg-transparent">
      <summary className="flex min-h-10 items-center rounded-control px-3 text-sm font-semibold text-muted hover:text-foreground">
        Ver as {items.length} {items.length === 1 ? "aplicação" : "aplicações"}
      </summary>
      <ul className="mt-1 grid divide-y divide-border">
        {items.map((i) => {
          const original = i.amount_original ? Number(i.amount_original) : null;
          return (
            <li
              key={i.id}
              className="grid gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_12rem] sm:items-center"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {i.purchase_date ? `Aplicado em ${fullDate(i.purchase_date)}` : i.name}
                </p>
                <p className="text-xs text-muted">
                  {i.institution_name !== "MeuPluggy" ? `${i.institution_name}, ` : ""}
                  {rateText(i)}
                  {i.due_date ? `, vence em ${fullDate(i.due_date)}` : ""}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-medium tabular">{money(i.balance)}</p>
                {original !== null && (
                  <p className="text-xs text-muted tabular">
                    aplicado {money(original)}
                    {Number(i.balance) !== original && (
                      <>
                        {", "}
                        <span className={cx(Number(i.balance) > original && "font-semibold text-positive")}>
                          {earnedText(Number(i.balance) - original, original)}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>
              <select
                aria-label={`Mover aplicação de ${fullDate(i.purchase_date)}`}
                className={cx(inputClass, "min-h-9 w-full text-xs")}
                value={i.pot_id ?? ""}
                onChange={(e) => onMove(i, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Sem cofrinho</option>
                {pots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function PotDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string, goal: number | null) => Promise<void> }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title="Novo cofrinho" onClose={onClose}>
      {(close) => (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const value = parseMoney(goal);
            if (!name.trim()) return setError("Dê um nome ao cofrinho.");
            if (value !== null && (Number.isNaN(value) || value < 0))
              return setError("Meta inválida. Use só números, como 3000 ou 3.000,00.");
            close(() => {
              onClose();
              onSave(name.trim(), value);
            });
          }}
        >
          <div className="grid gap-1.5">
            <label htmlFor="new-pot-name" className="label">
              Nome
            </label>
            <input
              id="new-pot-name"
              maxLength={100}
              placeholder="Reserva, Viagem, Carro…"
              className={cx(inputClass, "w-full")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="new-pot-goal" className="label">
              Meta (opcional)
            </label>
            <input
              id="new-pot-goal"
              inputMode="decimal"
              placeholder="sem meta"
              className={cx(inputClass, "w-full tabular")}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted">Depois, mova as aplicações para ele na lista de cada cofrinho.</p>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => close()}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Criar cofrinho
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
