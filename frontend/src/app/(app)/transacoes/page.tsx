"use client";

import { ArrowDownRight, ArrowUpRight, CalendarRange, List, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CategoryIcon, categoryStyle } from "@/components/category-icon";
import { Dialog } from "@/components/dialog";
import {
  Button,
  Card,
  Empty,
  ErrorNote,
  IconBadge,
  inputClass,
  Meter,
  PageHeader,
  cx,
} from "@/components/ui";
import {
  api,
  qs,
  type Account,
  type Category,
  type CategorySpend,
  type Transaction,
  type TransactionPage,
} from "@/lib/api";
import { CyclePicker } from "@/components/cycle-picker";
import { cycleName, useCycle } from "@/lib/cycle";
import { money, percent } from "@/lib/format";
import { usePageEnter } from "@/lib/motion";
import { notify } from "@/lib/signals";

const PAGE_SIZE = 50;
const KIND_LABEL = { EXPENSE: "Despesas", INCOME: "Receitas", TRANSFER: "Movimentações" };

/** "2026-10-15" -> "Hoje", "Ontem" ou "qua., 15 de out." */
function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - date.getTime()) /
      86_400_000,
  );
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: y === today.getFullYear() ? undefined : "numeric",
  });
}

export default function TransacoesPage() {
  // Ciclo da fatura; "" = todas as transações
  const { key: cycleKey, setKey: setCycleKey, info: cycle } = useCycle();
  const [allCycles, setAllCycles] = useState(false);
  const month = allCycles ? "" : (cycleKey ?? "");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TransactionPage | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<{ tx: Transaction; categoryId: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<CategorySpend[]>([]);
  const root = useRef<HTMLDivElement>(null);

  usePageEnter(root, data !== null);

  // Cards de categoria: gasto de cada uma com os mesmos filtros da lista (ciclo ou todos,
  // conta, busca), menos o de categoria, para os cards continuarem lá ao escolher um
  const loadBreakdown = useCallback(() => {
    if (!allCycles && !cycleKey) return;
    api<CategorySpend[]>(
      `/transactions/by-category${qs({ month: month || null, account_id: accountId, q: q.trim() })}`,
    )
      .then(setBreakdown)
      .catch((e) => setError(e.message));
  }, [month, allCycles, cycleKey, accountId, q]);

  useEffect(() => {
    const t = setTimeout(loadBreakdown, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadBreakdown, q]);

  useEffect(() => {
    Promise.all([api<Account[]>("/accounts"), api<Category[]>("/categories")])
      .then(([a, c]) => {
        setAccounts(a);
        setCategories(c);
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    if (!allCycles && !cycleKey) return; // esperando o ciclo atual
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
  }, [month, allCycles, cycleKey, accountId, categoryId, q, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0); // debounce da busca
    return () => clearTimeout(t);
  }, [load, q]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const byId = new Map(categories.map((c) => [c.id, c]));

  // Agrupa por dia, mantendo a ordem da API (mais recentes primeiro)
  const days: { date: string; items: Transaction[] }[] = [];
  for (const t of data?.items ?? []) {
    const last = days[days.length - 1];
    if (last?.date === t.date) last.items.push(t);
    else days.push({ date: t.date, items: [t] });
  }

  return (
    <div ref={root}>
      <PageHeader
        title="Transações"
        description="Troque a categoria direto na lista. Você pode aplicar a mudança às transações parecidas."
        actions={
          month ? (
            <>
              <CyclePicker value={month} info={cycle} onChange={(m) => filter(() => setCycleKey(m))} />
              <Button variant="ghost" onClick={() => filter(() => setAllCycles(true))}>
                <CalendarRange />
                Todos os ciclos
              </Button>
            </>
          ) : (
            <Button onClick={() => filter(() => setAllCycles(false))}>
              <CalendarRange />
              Filtrar por ciclo
            </Button>
          )
        }
      />

      <div className="grid gap-4">
        <Card data-enter className="flex flex-wrap gap-2 p-3 sm:p-3">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              className={cx(inputClass, "w-full pl-9")}
              placeholder="Buscar descrição ou estabelecimento"
              value={q}
              onChange={(e) => filter(() => setQ(e.target.value))}
            />
          </label>
          <select
            aria-label="Conta"
            className={cx(inputClass, "min-w-40 flex-1 sm:flex-none")}
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
          {/* Sem mês escolhido não há gasto por categoria para os cards: fica o seletor */}
          {!month && (
            <select
              aria-label="Categoria"
              className={cx(inputClass, "min-w-40 flex-1 sm:flex-none")}
              value={categoryId}
              onChange={(e) => filter(() => setCategoryId(e.target.value))}
            >
              <option value="">Todas as categorias</option>
              <CategoryOptions categories={categories} />
            </select>
          )}
        </Card>

        {breakdown.length > 0 && (
          <CategoryCards
            month={month}
            rows={breakdown}
            byId={byId}
            selected={categoryId}
            onSelect={(id) => filter(() => setCategoryId(id === categoryId ? "" : id))}
          />
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        {data && (
          <div data-enter className="grid gap-3 sm:grid-cols-3">
            <Summary icon={List} color="var(--cat-home)" label="Transações" value={String(data.total)} />
            <Summary
              icon={ArrowUpRight}
              color="var(--positive)"
              label="Entradas"
              value={money(data.income)}
              valueClass="text-positive"
            />
            <Summary
              icon={ArrowDownRight}
              color="var(--negative)"
              label="Saídas"
              value={money(data.expense)}
              valueClass="text-negative"
            />
            <p className="text-xs text-muted sm:col-span-3">
              Entradas e saídas não contam transferências entre suas contas nem pagamento de fatura.
            </p>
          </div>
        )}

        {data && (
          <Card data-enter className="p-0 sm:p-0">
            {data.items.length === 0 ? (
              <Empty icon={Search} color="var(--cat-home)">
                Nenhuma transação encontrada com esses filtros.
              </Empty>
            ) : (
              days.map((day) => {
                const total = day.items
                  .filter((t) => t.category_kind !== "TRANSFER")
                  .reduce((sum, t) => sum + Number(t.amount), 0);
                return (
                  <section key={day.date} aria-label={dayLabel(day.date)}>
                    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/50 px-4 py-2 first:rounded-t-card sm:px-5">
                      <h2 className="text-xs font-semibold text-muted first-letter:uppercase">
                        {dayLabel(day.date)}
                      </h2>
                      <span
                        className={cx(
                          "text-xs font-semibold tabular",
                          total < 0 ? "text-negative" : total > 0 ? "text-positive" : "text-muted",
                        )}
                      >
                        {total > 0 ? "+" : ""}
                        {money(total)}
                      </span>
                    </header>
                    <ul className="divide-y divide-border">
                      {day.items.map((t) => {
                        const cat = t.category_id ? byId.get(t.category_id) : undefined;
                        const details = [
                          t.account_name,
                          t.installment_total && `parcela ${t.installment_number}/${t.installment_total}`,
                          t.status === "PENDING" && "pendente",
                        ].filter(Boolean);
                        return (
                          <li
                            key={t.id}
                            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_12rem_8rem] sm:px-5"
                          >
                            <CategoryIcon categoryKey={cat?.key} kind={t.category_kind} />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{t.merchant ?? t.description}</p>
                              <p className="truncate text-xs text-muted">
                                {details.join(", ")}
                                {t.merchant && <span className="hidden sm:inline">, {t.description}</span>}
                              </p>
                            </div>
                            <span
                              className={cx(
                                "text-right font-semibold whitespace-nowrap tabular sm:order-last",
                                t.category_kind === "TRANSFER"
                                  ? "text-muted"
                                  : Number(t.amount) < 0
                                    ? "text-foreground"
                                    : "text-positive",
                              )}
                            >
                              {Number(t.amount) > 0 && t.category_kind !== "TRANSFER" ? "+" : ""}
                              {money(t.amount)}
                            </span>
                            <select
                              className={cx(
                                // Um por linha: preenchido e sem contorno, que só aparece no hover/foco
                                "min-h-9 w-full rounded-control border border-transparent bg-surface-2 px-3 text-xs text-foreground outline-none",
                                "transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:border-border",
                                "focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_25%,transparent)]",
                                "col-span-2 col-start-2 sm:col-span-1 sm:col-start-auto",
                              )}
                              value={t.category_id ?? ""}
                              onChange={(e) => setEditing({ tx: t, categoryId: Number(e.target.value) })}
                              aria-label={`Categoria de ${t.merchant ?? t.description}`}
                            >
                              {!t.category_id && <option value="">Sem categoria</option>}
                              <CategoryOptions categories={categories} />
                            </select>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )}
          </Card>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 text-sm">
            <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span className="text-muted tabular">
              {page} de {pages}
            </span>
            <Button disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Próxima
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <RecategorizeDialog
          tx={editing.tx}
          category={categories.find((c) => c.id === editing.categoryId)!}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("Categoria atualizada.");
            load();
            loadBreakdown();
          }}
        />
      )}
    </div>
  );
}

/** Gasto por categoria como cards: clicar filtra a lista, clicar de novo limpa. */
function CategoryCards({
  month,
  rows,
  byId,
  selected,
  onSelect,
}: {
  /** "" = todos os ciclos */
  month: string;
  rows: CategorySpend[];
  byId: Map<number, Category>;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const total = rows.reduce((sum, r) => sum + Number(r.spent), 0);
  const scope = month ? `do ciclo de ${cycleName(month)}` : "de todos os ciclos";
  const card = (active: boolean) =>
    cx(
      "grid w-40 shrink-0 snap-start content-start gap-2 rounded-card border bg-surface p-3.5 text-left",
      "transition-[border-color,background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-surface-2",
      active ? "border-accent outline-2 outline-offset-0 outline-accent" : "border-card-edge",
    );
  return (
    <section data-enter aria-label={`Gastos por categoria ${scope}`} className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Gastos por categoria {scope}</h2>
        <span className="text-xs text-muted">clique para filtrar</span>
      </div>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pt-1 pb-2">
        <button type="button" className={card(selected === "")} aria-pressed={selected === ""} onClick={() => onSelect("")}>
          <IconBadge icon={List} color="var(--accent)" />
          <span className="text-sm font-semibold">Todas</span>
          <span className="text-lg font-display font-normal tabular">{money(total)}</span>
          <span className="text-xs text-muted">
            {rows.length} {rows.length === 1 ? "categoria" : "categorias"}
          </span>
        </button>
        {rows.map((r) => {
          const cat = r.category_id ? byId.get(r.category_id) : undefined;
          const id = r.category_id ? String(r.category_id) : "";
          if (!id) return null;
          const active = selected === id;
          const spent = Number(r.spent);
          const share = total ? spent / total : 0;
          return (
            <button key={id} type="button" className={card(active)} aria-pressed={active} onClick={() => onSelect(id)}>
              <CategoryIcon categoryKey={cat?.key} kind={cat?.kind ?? "EXPENSE"} />
              <span className="truncate text-sm font-semibold">{r.category_name}</span>
              <span className="text-lg font-display font-normal tabular">{money(spent)}</span>
              <Meter thin value={share} color={categoryStyle(cat?.key, cat?.kind ?? "EXPENSE").color} />
              <span className="text-xs text-muted tabular">{percent(share)} do total</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Summary({
  icon,
  color,
  label,
  value,
  valueClass,
}: {
  icon: typeof List;
  color: string;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-card-edge bg-surface px-4 py-3">
      <IconBadge icon={icon} color={color} size="sm" />
      <span className="text-sm text-muted">{label}</span>
      <span className={cx("ml-auto text-[17px] font-medium tabular", valueClass)}>{value}</span>
    </div>
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

  async function save(close: (after?: () => void) => void) {
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
      close(onSaved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <Dialog title="Mudar categoria" onClose={onClose}>
      {(close) => (
        <div className="grid gap-4">
          <div className="flex items-center gap-3 rounded-control bg-surface-2 p-3">
            <CategoryIcon categoryKey={category.key} kind={category.kind} />
            <p className="min-w-0 text-sm">
              <strong className="block truncate font-semibold">{tx.merchant ?? tx.description}</strong>
              <span className="text-muted">vai para {category.name}</span>
            </p>
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--accent)]"
              checked={createRule}
              onChange={(e) => setCreateRule(e.target.checked)}
            />
            Aplicar também às transações parecidas, atuais e futuras
          </label>
          {createRule && (
            <div className="grid gap-1.5">
              <label htmlFor="rule-pattern" className="label">
                Texto que identifica as parecidas
              </label>
              <input
                id="rule-pattern"
                className={cx(inputClass, "w-full")}
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
              />
              <p className="text-xs text-muted">
                Toda transação cuja descrição contenha este texto vai para {category.name}.
              </p>
            </div>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close()}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => save(close)}
              disabled={saving || (createRule && !pattern.trim())}
            >
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
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
