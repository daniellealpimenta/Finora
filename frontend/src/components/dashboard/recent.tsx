"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CategoryIcon, categoryStyle } from "@/components/category-icon";
import { Card, CardTitle, Empty, cx } from "@/components/ui";
import { api, qs, type Category, type Transaction, type TransactionPage } from "@/lib/api";
import { money, shortDate } from "@/lib/format";
import { FULL, gsap, useGSAP } from "@/lib/motion";

const COUNT = 6;

/**
 * Últimas transações em linha do tempo (opção Doca, 2026-11-07): data à esquerda, um ponto na
 * cor da categoria ligado por uma linha fina, e o valor à direita. Entrada em verde.
 */
export function RecentCard({ keyById }: { keyById: Map<number, Category> }) {
  const [items, setItems] = useState<Transaction[] | null>(null);
  const root = useRef<HTMLOListElement>(null);

  useEffect(() => {
    api<TransactionPage>(`/transactions${qs({ page: 1, page_size: COUNT })}`)
      .then((p) => setItems(p.items))
      .catch(() => setItems([]));
  }, []);

  useGSAP(
    () => {
      if (!items?.length) return;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-tl-dot]", { scale: 0, stagger: 0.06, duration: 0.4, ease: "back.out(3)", delay: 0.2 });
        gsap.from("[data-tl-line]", { scaleY: 0, transformOrigin: "top", stagger: 0.06, duration: 0.4, delay: 0.25 });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [items] },
  );

  return (
    <Card data-enter>
      <CardTitle
        icon={History}
        color="var(--cat-home)"
        hint={
          <Link href="/transacoes" className="rounded-chip px-2 py-1 text-xs font-semibold text-accent hover:bg-surface-2">
            Ver todas
          </Link>
        }
      >
        Últimas transações
      </CardTitle>
      {items === null ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : items.length === 0 ? (
        <Empty icon={History} color="var(--cat-home)">
          Nenhuma transação ainda.
        </Empty>
      ) : (
        <ol ref={root} className="grid">
          {items.map((t, i) => {
            const cat = t.category_id ? keyById.get(t.category_id) : undefined;
            const { color } = categoryStyle(cat?.key, cat?.kind ?? t.category_kind ?? "EXPENSE");
            const value = Number(t.amount);
            return (
              <li key={t.id} className="grid grid-cols-[44px_14px_minmax(0,1fr)_auto] gap-x-3">
                <time className="pt-2 text-xs text-muted tabular">{shortDate(t.date)}</time>
                <span className="relative grid justify-items-center">
                  <span
                    data-tl-dot
                    className="mt-3 size-2.5 rounded-full"
                    style={{ background: color, boxShadow: `0 0 0 4px color-mix(in oklab, ${color} 18%, transparent)` }}
                  />
                  {i < items.length - 1 && <span data-tl-line className="absolute top-6 bottom-0 w-px bg-border" />}
                </span>
                <span className="flex min-w-0 items-center gap-3 pb-3">
                  <CategoryIcon categoryKey={cat?.key} kind={cat?.kind ?? t.category_kind ?? "EXPENSE"} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.merchant ?? t.description}</span>
                    <span className="block truncate text-xs text-muted">
                      {t.category_name ?? "Sem categoria"}
                      {t.status === "PENDING" && " · pendente"}
                    </span>
                  </span>
                </span>
                <span className={cx("pt-1.5 text-right font-medium tabular", value > 0 && "text-positive")}>
                  {value > 0 ? "+" : "−"}
                  {money(Math.abs(value))}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
