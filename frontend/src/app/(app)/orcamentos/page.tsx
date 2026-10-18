"use client";

import { Target } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CategoryIcon, categoryStyle } from "@/components/category-icon";
import {
  Button,
  Card,
  CardTitle,
  Empty,
  ErrorNote,
  Meter,
  MonthPicker,
  PageHeader,
  Pill,
  STATUS_COLOR,
  cx,
  inputClass,
  type Status,
} from "@/components/ui";
import { api, qs, type Category } from "@/lib/api";
import { currentMonth, money, monthLabel, percent } from "@/lib/format";
import { usePageEnter } from "@/lib/motion";
import { notify } from "@/lib/signals";

type Row = { category_id: number | null; spent: number; budget: number | null };

const NEAR_LIMIT = 0.8;
const budgetStatus = (ratio: number): Status => (ratio > 1 ? "bad" : ratio > NEAR_LIMIT ? "warn" : "ok");
const STATUS_TEXT: Record<Status, string> = { ok: "Dentro", warn: "Perto do limite", bad: "Estourou" };

export default function OrcamentosPage() {
  const [month, setMonth] = useState(currentMonth);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [rows, setRows] = useState<Map<number, Row>>(new Map());
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  usePageEnter(root, categories !== null);

  const load = useCallback(async () => {
    const [cats, breakdown] = await Promise.all([
      api<Category[]>("/categories"),
      api<Row[]>(`/dashboard/categories${qs({ month })}`),
    ]);
    setCategories(cats.filter((c) => c.kind === "EXPENSE"));
    setRows(new Map(breakdown.filter((r) => r.category_id).map((r) => [r.category_id!, r])));
    setDrafts({});
  }, [month]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function save(category: Category) {
    const raw = (drafts[category.id] ?? "").replace(/\./g, "").replace(",", ".").trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      setError(`Valor inválido para ${category.name}. Use só números, como 800 ou 800,50.`);
      return;
    }
    try {
      await api("/budgets", {
        method: "PUT",
        body: JSON.stringify({ category_id: category.id, month, limit_amount: value }),
      });
      setError(null);
      notify(value === null ? `Limite de ${category.name} removido.` : `Limite de ${category.name} salvo.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const all = categories ?? [];
  const budgeted = all
    .filter((c) => rows.get(c.id)?.budget)
    .sort((a, b) => ratioOf(rows.get(b.id)) - ratioOf(rows.get(a.id)));
  const others = all
    .filter((c) => !rows.get(c.id)?.budget)
    .sort((a, b) => (rows.get(b.id)?.spent ?? 0) - (rows.get(a.id)?.spent ?? 0) || a.name.localeCompare(b.name));

  const totalBudget = budgeted.reduce((sum, c) => sum + (rows.get(c.id)?.budget ?? 0), 0);
  const totalSpent = budgeted.reduce((sum, c) => sum + (rows.get(c.id)?.spent ?? 0), 0);
  const counts = { ok: 0, warn: 0, bad: 0 };
  budgeted.forEach((c) => counts[budgetStatus(ratioOf(rows.get(c.id)))]++);

  const rowProps = (c: Category) => ({
    category: c,
    row: rows.get(c.id),
    draft: drafts[c.id],
    onDraft: (v: string) => setDrafts({ ...drafts, [c.id]: v }),
    onSave: () => save(c),
  });

  return (
    <div ref={root}>
      <PageHeader
        title="Orçamentos"
        description={`Um limite definido em ${monthLabel(month)} continua valendo nos meses seguintes até você mudar. Deixe em branco para remover.`}
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />

      <div className="grid gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {categories && totalBudget > 0 && (
          <Card data-enter className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="grid gap-3">
              <p className="label uppercase">Gasto nas categorias com limite</p>
              <p className="text-[clamp(32px,5vw,44px)] leading-tight font-light tracking-[-0.03em] tabular">
                {money(totalSpent)}
                <span className="text-base font-medium tracking-normal text-muted"> de {money(totalBudget)}</span>
              </p>
              <Meter
                value={totalSpent / totalBudget}
                color={STATUS_COLOR[budgetStatus(totalSpent / totalBudget)]}
                label={`${percent(totalSpent / totalBudget)} do total de limites`}
              />
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {(["ok", "warn", "bad"] as const).map((s) => (
                <Pill key={s} status={s}>
                  {counts[s]} {STATUS_TEXT[s].toLowerCase()}
                </Pill>
              ))}
            </div>
          </Card>
        )}

        {categories && (
          <Card data-enter>
            <CardTitle icon={Target} color="var(--cat-move)" hint={`${budgeted.length} categorias`}>
              Com limite
            </CardTitle>
            {budgeted.length === 0 ? (
              <Empty icon={Target} color="var(--cat-move)">
                Nenhum limite ainda. Defina um valor em uma das categorias abaixo para acompanhar o mês.
              </Empty>
            ) : (
              <ul className="grid divide-y divide-border">
                {budgeted.map((c) => (
                  <BudgetRow key={c.id} {...rowProps(c)} />
                ))}
              </ul>
            )}
          </Card>
        )}

        {categories && others.length > 0 && (
          <Card data-enter>
            <CardTitle hint="ordenadas pelo gasto do mês">Sem limite</CardTitle>
            <ul className="grid divide-y divide-border">
              {others.map((c) => (
                <BudgetRow key={c.id} {...rowProps(c)} />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function ratioOf(row: Row | undefined) {
  return row?.budget ? row.spent / row.budget : 0;
}

function BudgetRow({
  category,
  row,
  draft,
  onDraft,
  onSave,
}: {
  category: Category;
  row: Row | undefined;
  draft: string | undefined;
  onDraft: (v: string) => void;
  onSave: () => void;
}) {
  const spent = row?.spent ?? 0;
  const budget = row?.budget ?? null;
  const ratio = budget ? spent / budget : 0;
  const status = budget ? budgetStatus(ratio) : null;
  const dirty = draft !== undefined && draft !== (budget?.toString().replace(".", ",") ?? "");
  const inputId = `budget-${category.id}`;
  return (
    <li className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="grid gap-2">
        <div className="flex items-center gap-3">
          <CategoryIcon categoryKey={category.key} kind="EXPENSE" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{category.name}</p>
            <p className="text-xs text-muted tabular">
              gasto {money(spent)}
              {budget !== null && ` de ${money(budget)}`}
            </p>
          </div>
          {status && (
            <Pill status={status} className="shrink-0">
              {status === "ok" ? percent(ratio) : STATUS_TEXT[status]}
            </Pill>
          )}
        </div>
        {budget !== null && (
          <div className="pl-12">
            <Meter
              thin
              value={ratio}
              color={status ? STATUS_COLOR[status] : categoryStyle(category.key).color}
              label={`${percent(ratio)} do limite`}
            />
          </div>
        )}
      </div>
      <form
        className="flex items-center gap-2 pl-12 sm:pl-0"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Limite mensal para {category.name}
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">
            R$
          </span>
          <input
            id={inputId}
            inputMode="decimal"
            placeholder="sem limite"
            className={cx(inputClass, "w-36 pl-9 text-right tabular")}
            value={draft ?? budget?.toString().replace(".", ",") ?? ""}
            onChange={(e) => onDraft(e.target.value)}
          />
        </div>
        <Button type="submit" variant={dirty ? "primary" : "secondary"} disabled={!dirty}>
          Salvar
        </Button>
      </form>
    </li>
  );
}
