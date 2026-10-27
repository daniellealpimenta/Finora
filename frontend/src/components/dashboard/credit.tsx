"use client";

import { CreditCard, Receipt } from "lucide-react";
import { useState } from "react";

import { Button, Card, CardTitle, Empty, IconBadge, STATUS_COLOR, StatusShape, cx, tone, type Status } from "@/components/ui";
import type { BillStatus, CardBill, CreditCardInfo } from "@/lib/api";
import { money, monthLabel, percent, shortDate } from "@/lib/format";
import { INFO_BILLS, INFO_CARDS } from "./info";

const BILL_PREVIEW = 6;

const BILL_LABEL: Record<BillStatus, string> = {
  open: "Aberta",
  closed: "Fechada",
  overdue: "Vencida",
  paid: "Paga",
};
const BILL_TONE: Record<BillStatus, Status | null> = { open: null, closed: "warn", overdue: "bad", paid: "ok" };

const titleCase = (t: string | null) => (t ? t.charAt(0) + t.slice(1).toLowerCase() : "");

/** "Fatura de novembro"; com o ano quando não é o ano corrente. */
function billTitle(competence: string) {
  const sameYear = competence.slice(0, 4) === String(new Date().getFullYear());
  const [label] = monthLabel(competence).split(" de ");
  return `Fatura de ${sameYear ? label.toLowerCase() : monthLabel(competence).toLowerCase()}`;
}

function billDetail(b: CardBill) {
  const due = b.due_date ? shortDate(b.due_date) : null;
  switch (b.status) {
    case "open":
      return [b.close_date && `fecha por volta de ${shortDate(b.close_date)}`, due && `vence ${due}`]
        .filter(Boolean)
        .join(", ");
    case "closed":
      return due ? `vence ${due}` : "aguardando pagamento";
    case "overdue":
      return due ? `venceu ${due}, sem pagamento identificado` : "sem pagamento identificado";
    case "paid":
      return b.paid_at ? `paga em ${shortDate(b.paid_at)}, venceu ${due}` : `venceu ${due}`;
  }
}

function BillChip({ status }: { status: BillStatus }) {
  const s = BILL_TONE[status];
  return (
    <span
      style={tone(s ? STATUS_COLOR[s] : "var(--accent)")}
      className="tint inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
    >
      {s ? <StatusShape status={s} className="size-2.5" /> : <span className="size-2 rounded-full bg-[var(--c)]" aria-hidden />}
      {BILL_LABEL[status]}
    </span>
  );
}

// --- Faturas ------------------------------------------------------------------------------

export function BillsCard({ cards }: { cards: CreditCardInfo[] }) {
  const [all, setAll] = useState(false);
  // A pagar primeiro (vencimento mais próximo), depois as pagas (mais recente primeiro)
  const bills = cards
    .flatMap((c) => c.bills.filter((b) => b.amount > 0).map((b) => ({ ...b, bank: c.bank, key: `${c.account_id}-${b.id}` })))
    .sort((a, b) => {
      const pa = a.status === "paid" ? 1 : 0;
      const pb = b.status === "paid" ? 1 : 0;
      if (pa !== pb) return pa - pb;
      const da = a.due_date ?? "9999";
      const db = b.due_date ?? "9999";
      return pa ? db.localeCompare(da) : da.localeCompare(db);
    });
  const toPay = bills.filter((b) => b.status !== "paid").reduce((sum, b) => sum + Number(b.amount), 0);
  const shown = all ? bills : bills.slice(0, BILL_PREVIEW);

  return (
    <Card data-enter className="grid content-start gap-4">
      <CardTitle icon={Receipt} color="var(--cat-move)" info={INFO_BILLS}>
        Faturas
      </CardTitle>
      {bills.length === 0 ? (
        <Empty icon={Receipt} color="var(--cat-move)">
          Nenhuma fatura encontrada. Conecte um cartão em Contas.
        </Empty>
      ) : (
        <>
          <p className="-mt-2 text-sm text-muted">
            {toPay > 0 ? (
              <>
                A pagar: <strong className="font-semibold text-foreground tabular">{money(toPay)}</strong>
              </>
            ) : (
              "Tudo pago por enquanto."
            )}
          </p>
          <ul className="grid divide-y divide-border">
            {shown.map((b) => (
              <li key={b.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <IconBadge icon={CreditCard} color="var(--cat-move)" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate font-medium">{billTitle(b.competence)}</span>
                    <BillChip status={b.status} />
                  </p>
                  <p className="truncate text-xs text-muted">
                    {b.bank}, {billDetail(b)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cx("font-medium whitespace-nowrap tabular", b.status === "overdue" && "text-negative")}>
                    {money(b.amount)}
                  </p>
                  {b.status === "open" && b.purchases !== null && (
                    <p className="text-xs whitespace-nowrap text-muted tabular">
                      {b.purchases} {b.purchases === 1 ? "lançamento" : "lançamentos"} até agora
                    </p>
                  )}
                  {(b.status === "closed" || b.status === "overdue") && b.minimum_payment !== null && (
                    <p className="text-xs whitespace-nowrap text-muted tabular">mínimo {money(b.minimum_payment)}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {bills.length > BILL_PREVIEW && (
            <Button variant="ghost" className="w-full" onClick={() => setAll(!all)}>
              {all ? "Mostrar menos" : `Ver todas as ${bills.length} faturas`}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

// --- Cartões ------------------------------------------------------------------------------

/** Uso do limite: até 30% é saudável, até 70% pede atenção. */
const usageStatus = (share: number): Status => (share <= 0.3 ? "ok" : share <= 0.7 ? "warn" : "bad");

/** Barra do limite em duas partes: faturas (cheio) e parcelas futuras (hachurado). */
function LimitBar({ used, installments, limit, label }: { used: number; installments: number; limit: number; label: string }) {
  const share = limit > 0 ? Math.min(used / limit, 1) : 0;
  const future = limit > 0 ? Math.min(installments / limit, share) : 0;
  const color = STATUS_COLOR[usageStatus(share)];
  return (
    <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={label}>
      <div data-fill className="absolute inset-y-0 left-0 flex origin-left" style={{ width: `${share * 100}%` }}>
        <i className="block h-full" style={{ width: `${share > 0 ? ((share - future) / share) * 100 : 0}%`, background: color }} />
        <i
          className="block h-full"
          style={{
            width: `${share > 0 ? (future / share) * 100 : 0}%`,
            background: `repeating-linear-gradient(135deg, ${color} 0 3px, color-mix(in oklab, ${color} 45%, transparent) 3px 6px)`,
          }}
        />
      </div>
    </div>
  );
}

export function CardsCard({ cards }: { cards: CreditCardInfo[] }) {
  const withLimit = cards.filter((c) => c.credit_limit !== null && Number(c.credit_limit) > 0);
  const totalLimit = withLimit.reduce((sum, c) => sum + Number(c.credit_limit), 0);
  const totalUsed = withLimit.reduce((sum, c) => sum + Number(c.used), 0);
  const totalInstallments = withLimit.reduce((sum, c) => sum + Number(c.installments_used ?? 0), 0);
  const totalColor = STATUS_COLOR[usageStatus(totalLimit > 0 ? totalUsed / totalLimit : 0)];

  return (
    <Card data-enter className="grid content-start gap-4">
      <CardTitle icon={CreditCard} color="var(--cat-move)" info={INFO_CARDS}>
        Cartões
      </CardTitle>
      {cards.length === 0 ? (
        <Empty icon={CreditCard} color="var(--cat-move)">
          Nenhum cartão conectado.
        </Empty>
      ) : (
        <>
          {withLimit.length > 0 && (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[28px] leading-tight font-display font-normal tracking-[-0.02em] tabular">
                  {money(totalUsed)}
                  <span className="text-sm font-medium tracking-normal text-muted"> de {money(totalLimit)}</span>
                </p>
                <span className="text-xs text-muted tabular">{percent(totalUsed / totalLimit)} do limite total</span>
              </div>
              <LimitBar
                used={totalUsed}
                installments={totalInstallments}
                limit={totalLimit}
                label={`${percent(totalUsed / totalLimit)} do limite total usado`}
              />
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: totalColor }} aria-hidden />
                  faturas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-[3px]"
                    style={{
                      background: `repeating-linear-gradient(135deg, ${totalColor} 0 2px, color-mix(in oklab, ${totalColor} 45%, transparent) 2px 4px)`,
                    }}
                    aria-hidden
                  />
                  parcelas futuras
                </span>
                <span className="ml-auto tabular">disponível {money(totalLimit - totalUsed)}</span>
              </p>
            </div>
          )}
          <ul className="grid divide-y divide-border">
            {cards.map((c) => {
              const limit = c.credit_limit !== null ? Number(c.credit_limit) : null;
              const used = Number(c.used);
              const installments = Number(c.installments_used ?? 0);
              const kind = [titleCase(c.brand), titleCase(c.level)].filter(Boolean).join(" ");
              return (
                <li key={c.account_id} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <IconBadge icon={CreditCard} color="var(--cat-move)" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.bank}</p>
                      <p className="truncate text-xs text-muted">
                        {kind || c.name}
                        {c.number && ` •••• ${c.number}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium whitespace-nowrap tabular">{money(used)}</p>
                      {limit !== null && (
                        <p className="text-xs whitespace-nowrap text-muted tabular">de {money(limit)}</p>
                      )}
                    </div>
                  </div>
                  {limit !== null && limit > 0 && (
                    <div className="grid gap-1.5 pl-12">
                      <LimitBar
                        used={used}
                        installments={installments}
                        limit={limit}
                        label={`${c.bank}: ${percent(used / limit)} do limite usado`}
                      />
                      <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted tabular">
                        <span>
                          {percent(used / limit)} usado
                          {installments > 0 && `, ${money(installments)} em parcelas futuras`}
                        </span>
                        <span>disponível {money(limit - used)}</span>
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
