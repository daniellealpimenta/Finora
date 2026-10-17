"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Button,
  Card,
  Empty,
  ErrorNote,
  inputClass,
  MonthPicker,
  PageHeader,
  cx,
} from "@/components/ui";
import {
  api,
  qs,
  type Account,
  type Category,
  type Transaction,
  type TransactionPage,
} from "@/lib/api";
import { currentMonth, money, shortDate } from "@/lib/format";

const PAGE_SIZE = 50;
const KIND_LABEL = { EXPENSE: "Despesas", INCOME: "Receitas", TRANSFER: "Movimentações" };

export default function TransacoesPage() {
  const [month, setMonth] = useState(currentMonth);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TransactionPage | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<{ tx: Transaction; categoryId: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<Account[]>("/accounts"), api<Category[]>("/categories")])
      .then(([a, c]) => {
        setAccounts(a);
        setCategories(c);
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    api<TransactionPage>(
      `/transactions${qs({
        month: month || null,
        account_id: accountId,
        category_id: categoryId,
        q: q.trim(),
        page,
        page_size: PAGE_SIZE,
      })}`,
    )
      .then(setData)
      .catch((e) => setError(e.message));
  }, [month, accountId, categoryId, q, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0); // debounce da busca
    return () => clearTimeout(t);
  }, [load, q]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Transações"
        actions={
          month ? (
            <>
              <MonthPicker value={month} onChange={(m) => filter(() => setMonth(m))} />
              <Button variant="ghost" onClick={() => filter(() => setMonth(""))}>
                Todos os meses
              </Button>
            </>
          ) : (
            <Button onClick={() => filter(() => setMonth(currentMonth()))}>Filtrar por mês</Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className={cx(inputClass, "min-w-56 flex-1")}
          placeholder="Buscar descrição ou estabelecimento"
          value={q}
          onChange={(e) => filter(() => setQ(e.target.value))}
        />
        <select
          className={inputClass}
          value={accountId}
          onChange={(e) => filter(() => setAccountId(e.target.value))}
        >
          <option value="">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={categoryId}
          onChange={(e) => filter(() => setCategoryId(e.target.value))}
        >
          <option value="">Todas as categorias</option>
          <CategoryOptions categories={categories} />
        </select>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {data && (
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-muted">{data.total} transações</span>
          <span>
            Entradas <strong className="tabular text-positive">{money(data.income)}</strong>
          </span>
          <span>
            Saídas <strong className="tabular text-negative">{money(data.expense)}</strong>
          </span>
          <span className="text-xs text-muted">(sem transferências entre contas e faturas)</span>
        </div>
      )}

      <Card className="p-0">
        {data && data.items.length === 0 ? (
          <Empty>Nenhuma transação encontrada.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {data?.items.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="w-12 shrink-0 text-xs text-muted tabular">
                  {shortDate(t.date)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t.merchant ?? t.description}</p>
                  <p className="truncate text-xs text-muted">
                    {t.account_name}
                    {t.merchant && ` · ${t.description}`}
                    {t.installment_total && ` · parcela ${t.installment_number}/${t.installment_total}`}
                    {t.status === "PENDING" && " · pendente"}
                  </p>
                </div>
                <select
                  className={cx(inputClass, "max-w-48 py-1 text-xs")}
                  value={t.category_id ?? ""}
                  onChange={(e) => setEditing({ tx: t, categoryId: Number(e.target.value) })}
                  aria-label="Categoria"
                >
                  {!t.category_id && <option value="">Sem categoria</option>}
                  <CategoryOptions categories={categories} />
                </select>
                <span
                  className={cx(
                    "w-28 shrink-0 text-right text-sm tabular",
                    t.category_kind === "TRANSFER"
                      ? "text-muted"
                      : Number(t.amount) < 0
                        ? "text-negative"
                        : "text-positive",
                  )}
                >
                  {money(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span className="text-muted">
            {page} de {pages}
          </span>
          <Button disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Próxima
          </Button>
        </div>
      )}

      {editing && (
        <RecategorizeDialog
          tx={editing.tx}
          category={categories.find((c) => c.id === editing.categoryId)!}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function CategoryOptions({ categories }: { categories: Category[] }) {
  return (
    <>
      {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((kind) => (
        <optgroup key={kind} label={KIND_LABEL[kind]}>
          {categories
            .filter((c) => c.kind === kind)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

function RecategorizeDialog({
  tx,
  category,
  onClose,
  onSaved,
}: {
  tx: Transaction;
  category: Category;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [createRule, setCreateRule] = useState(true);
  const [pattern, setPattern] = useState(suggestPattern(tx));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    try {
      await api(`/transactions/${tx.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          category_id: category.id,
          create_rule: createRule,
          rule_pattern: createRule ? pattern : null,
        }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 font-medium">Mudar categoria</h2>
        <p className="mb-4 text-sm text-muted">
          <strong className="text-foreground">{tx.merchant ?? tx.description}</strong> →{" "}
          {category.name}
        </p>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={createRule}
            onChange={(e) => setCreateRule(e.target.checked)}
          />
          Aplicar também às transações parecidas (atuais e futuras)
        </label>
        {createRule && (
          <div className="mb-4">
            <input
              className={cx(inputClass, "w-full")}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted">
              Toda transação cuja descrição contenha este texto vai para {category.name}.
            </p>
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={saving || (createRule && !pattern.trim())}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Sugere um padrão estável: estabelecimento, ou a descrição sem números/datas no fim. */
function suggestPattern(tx: Transaction) {
  if (tx.merchant) return tx.merchant;
  return tx.description
    .replace(/[\d/*#.-]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
