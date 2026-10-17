"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Card, ErrorNote, MonthPicker, PageHeader, cx, inputClass } from "@/components/ui";
import { api, qs, type Category } from "@/lib/api";
import { currentMonth, money, monthLabel } from "@/lib/format";

type Row = { category_id: number | null; spent: number; budget: number | null };

export default function OrcamentosPage() {
  const [month, setMonth] = useState(currentMonth);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Map<number, Row>>(new Map());
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

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

  async function save(categoryId: number) {
    const raw = (drafts[categoryId] ?? "").replace(/\./g, "").replace(",", ".").trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      setError("Valor inválido");
      return;
    }
    try {
      await api("/budgets", {
        method: "PUT",
        body: JSON.stringify({ category_id: categoryId, month, limit_amount: value }),
      });
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const totalBudget = [...rows.values()].reduce((sum, r) => sum + (r.budget ?? 0), 0);
  const totalSpentBudgeted = [...rows.values()]
    .filter((r) => r.budget)
    .reduce((sum, r) => sum + r.spent, 0);

  // Categorias com orçamento ou gasto primeiro, depois o resto
  const sorted = [...categories].sort((a, b) => {
    const ra = rows.get(a.id), rb = rows.get(b.id);
    const wa = (ra?.budget ? 2 : 0) + (ra?.spent ? 1 : 0);
    const wb = (rb?.budget ? 2 : 0) + (rb?.spent ? 1 : 0);
    return wb - wa || (rb?.spent ?? 0) - (ra?.spent ?? 0) || a.name.localeCompare(b.name);
  });

  return (
    <>
      <PageHeader title="Orçamentos" actions={<MonthPicker value={month} onChange={setMonth} />} />
      <p className="mb-4 text-sm text-muted">
        Um limite definido em {monthLabel(month)} continua valendo nos meses seguintes até você
        mudar. Deixe em branco para remover.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}

      {totalBudget > 0 && (
        <Card className="mb-4">
          <p className="text-sm">
            Gasto nas categorias com orçamento:{" "}
            <strong className={cx(totalSpentBudgeted > totalBudget && "text-negative")}>
              {money(totalSpentBudgeted)}
            </strong>{" "}
            de {money(totalBudget)}
          </p>
        </Card>
      )}

      <Card className="p-0">
        <ul className="divide-y divide-border">
          {sorted.map((c) => {
            const row = rows.get(c.id);
            const spent = row?.spent ?? 0;
            const budget = row?.budget ?? null;
            const ratio = budget ? spent / budget : 0;
            const draft = drafts[c.id];
            const dirty = draft !== undefined && draft !== (budget?.toString() ?? "");
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-40 flex-1">
                  <p className="text-sm">{c.name}</p>
                  <p className="text-xs text-muted tabular">
                    gasto {money(spent)}
                    {budget !== null && ` de ${money(budget)}`}
                  </p>
                  {budget !== null && (
                    <div className="mt-1.5 h-1.5 max-w-xs rounded-full bg-surface-2">
                      <div
                        className={cx(
                          "h-1.5 rounded-full",
                          ratio > 1 ? "bg-negative" : ratio > 0.8 ? "bg-warning" : "bg-positive",
                        )}
                        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                      />
                    </div>
                  )}
                  {budget !== null && ratio > 0.8 && (
                    <p className={cx("mt-1 text-xs", ratio > 1 ? "text-negative" : "text-warning")}>
                      {ratio > 1 ? "■ Estourou" : "▲ Perto do limite"} ({Math.round(ratio * 100)}%)
                    </p>
                  )}
                </div>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(c.id);
                  }}
                >
                  <span className="text-sm text-muted">R$</span>
                  <input
                    inputMode="decimal"
                    placeholder="sem limite"
                    className={cx(inputClass, "w-28 text-right")}
                    value={draft ?? budget?.toString().replace(".", ",") ?? ""}
                    onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                    aria-label={`Limite para ${c.name}`}
                  />
                  <Button type="submit" variant={dirty ? "primary" : "secondary"} disabled={!dirty}>
                    Salvar
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
