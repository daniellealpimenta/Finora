"use client";

import {
  CalendarRange,
  CreditCard,
  FileUp,
  FlaskConical,
  HandCoins,
  Landmark,
  PiggyBank,
  Plug,
  RefreshCw,
  Trash2,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Dialog } from "@/components/dialog";
import {
  Button,
  Card,
  ErrorNote,
  IconBadge,
  inputClass,
  Meter,
  PageHeader,
  Pill,
  STATUS_COLOR,
  cx,
  type Status,
} from "@/components/ui";
import { Pila } from "@/components/pila";
import {
  api,
  type Account,
  type AccountType,
  type Connection,
  type CreditCardInfo,
  type Investment,
  type SyncStatus,
} from "@/lib/api";
import { cycleRange, type CycleInfo } from "@/lib/cycle";
import { ACCOUNT_TYPE_LABEL, dateTime, money, percent, shortDate } from "@/lib/format";
import { FULL, gsap, motion, useGSAP, usePageEnter } from "@/lib/motion";
import { notify, setSyncing } from "@/lib/signals";

const STATUS: Record<string, [Status, string]> = {
  UPDATED: ["ok", "Atualizada"],
  UPDATING: ["warn", "Atualizando"],
  LOGIN_ERROR: ["bad", "Erro de login"],
  OUTDATED: ["warn", "Desatualizada"],
  WAITING_USER_INPUT: ["warn", "Aguardando você"],
};

const ACCOUNT_ICON: Record<AccountType, [LucideIcon, string]> = {
  CHECKING: [Wallet, "var(--cat-fun)"],
  SAVINGS: [PiggyBank, "var(--cat-home)"],
  CREDIT_CARD: [CreditCard, "var(--cat-move)"],
  INVESTMENT: [TrendingUp, "var(--positive)"],
  LOAN: [HandCoins, "var(--cat-fin)"],
  OTHER: [Landmark, "var(--cat-fin)"],
};

// Aplicação Pluggy em trial só cria itens do sandbox e do MeuPluggy
// (bancos reais -> 400 TRIAL_CLIENT_ITEM_CREATE_NOT_ALLOWED). Os bancos reais
// são conectados em https://meu.pluggy.ai e chegam aqui pelo conector MeuPluggy.
const MEU_PLUGGY_CONNECTOR_ID = 200;

export default function ContasPage() {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [manual, setManual] = useState<Account[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const [cards, setCards] = useState<Map<number, CreditCardInfo>>(new Map());
  const [cycle, setCycle] = useState<CycleInfo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const syncIcon = useRef<HTMLSpanElement>(null);

  usePageEnter(root, connections !== null);

  const load = useCallback(async () => {
    const [conns, accounts, status, inv, cardList, cycleInfo] = await Promise.all([
      api<Connection[]>("/connections"),
      api<Account[]>("/accounts"),
      api<SyncStatus>("/sync/status"),
      api<Investment[]>("/investments"),
      api<CreditCardInfo[]>("/cards"),
      api<CycleInfo>("/dashboard/cycle"),
    ]);
    setCycle(cycleInfo);
    setCards(new Map(cardList.map((c) => [c.account_id, c])));
    setConnections(conns);
    setInvestments(inv);
    setManual(accounts.filter((a) => a.connection_id === null));
    setSync(status);
    return status;
  }, []);

  useEffect(() => {
    load().catch((e) => setError(String(e.message ?? e)));
  }, [load]);

  async function saveClosingDay(account: Account, day: number | null) {
    try {
      await api(`/accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ closing_day: day }) });
      await load();
      notify(day === null ? "Fechamento volta a ser estimado pelas faturas." : `Fechamento no dia ${day} salvo.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveCycleStart(day: number | null) {
    try {
      await api("/dashboard/cycle", { method: "PUT", body: JSON.stringify({ start_day: day }) });
      await load();
      notify(day === null ? "Os ciclos voltam a seguir a fatura do cartão." : `Ciclos começando no dia ${day}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // O disco do cofre no menu e o ícone do botão giram enquanto sincroniza
  const running = Boolean(sync?.running);
  useEffect(() => {
    setSyncing(running);
    return () => setSyncing(false);
  }, [running]);

  useGSAP(
    () => {
      if (!running) return;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.to(syncIcon.current, { rotation: 360, duration: motion.spin.duration, ease: "none", repeat: -1 });
      });
      return () => mm.revert();
    },
    { dependencies: [running], revertOnUpdate: true },
  );

  // Enquanto um sync roda, atualiza a tela a cada 2s
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const status = await load();
      if (!status.running) {
        clearInterval(timer);
        const r = status.last_result;
        if (status.last_error) setError(`A sincronização falhou: ${status.last_error}`);
        else if (r) {
          notify(`Sincronizado: ${r.created} novas, ${r.updated} atualizadas, ${r.deleted} removidas.`);
          if (r.errors.length) setError(`Alguns bancos tiveram erro: ${r.errors.join("; ")}`);
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [running, load]);

  async function startSync() {
    setError(null);
    setSync(await api<SyncStatus>("/sync", { method: "POST" }));
  }

  async function connectBank() {
    setError(null);
    setConnecting(true);
    try {
      const { access_token } = await api<{ access_token: string }>("/pluggy/connect-token", {
        method: "POST",
      });
      // Carregado só no navegador (o SDK usa window)
      const { PluggyConnect } = await import("pluggy-connect-sdk");
      const widget = new PluggyConnect({
        connectToken: access_token,
        includeSandbox: sandbox,
        ...(sandbox ? {} : { connectorIds: [MEU_PLUGGY_CONNECTOR_ID] }),
        onSuccess: async ({ item }) => {
          await api<Connection>("/connections", {
            method: "POST",
            body: JSON.stringify({ item_id: item.id }),
          });
          notify(`${item.connector?.name ?? "Banco"} conectado. Sincronizando…`);
          await load();
          setSync((s) => (s ? { ...s, running: true } : s));
        },
        onError: ({ message }) => setError(`Pluggy: ${message}`),
        onClose: () => setConnecting(false),
      });
      await widget.init();
    } catch (e) {
      setConnecting(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeConnection(c: Connection) {
    await api(`/connections/${c.id}`, { method: "DELETE" });
    notify(`${c.institution_name} removido.`);
    await load();
  }

  async function importOfx(file: File) {
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api<{ account_name: string; created: number; skipped: number }>(
        "/import/ofx",
        { method: "POST", body: form },
      );
      notify(`${r.account_name}: ${r.created} transações importadas, ${r.skipped} já existiam.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const accounts = [...(connections ?? []).flatMap((c) => c.accounts), ...manual];
  const sumOf = (types: AccountType[]) =>
    accounts.filter((a) => types.includes(a.type)).reduce((sum, a) => sum + Number(a.balance), 0);

  return (
    <div ref={root}>
      <PageHeader
        title="Contas"
        description={
          sync?.last_finished_at
            ? `Última sincronização: ${dateTime(sync.last_finished_at)}. Sincroniza sozinho a cada 6 horas enquanto o sistema roda.`
            : "Sincroniza sozinho a cada 6 horas enquanto o sistema roda."
        }
        actions={
          <>
            <Button onClick={startSync} disabled={running || (connections ?? []).length === 0}>
              <span ref={syncIcon} className="grid place-items-center">
                <RefreshCw />
              </span>
              {running ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <FileUp />
              Importar OFX
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".ofx,.OFX"
              hidden
              onChange={(e) => e.target.files?.[0] && importOfx(e.target.files[0])}
            />
            <Button variant="primary" onClick={connectBank} disabled={connecting}>
              <Plug />
              Conectar banco
            </Button>
          </>
        }
      />

      <div className="grid gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {connections && accounts.length > 0 && (
          <div data-enter className="grid gap-3 sm:grid-cols-3">
            <Total icon={Wallet} color="var(--cat-fun)" label="Em conta" value={sumOf(["CHECKING", "SAVINGS"])} />
            <Total
              icon={PiggyBank}
              color="var(--positive)"
              label="Em cofrinhos"
              value={sumOf(["INVESTMENT"]) + investments.reduce((sum, i) => sum + Number(i.balance), 0)}
            />
            <Total icon={CreditCard} color="var(--cat-move)" label="Faturas" value={-sumOf(["CREDIT_CARD"])} />
          </div>
        )}

        {cycle && <CycleStart cycle={cycle} onSave={saveCycleStart} />}

        {connections && connections.length === 0 && manual.length === 0 && (
          <Card data-enter>
            <div className="grid justify-items-center gap-4 py-8 text-center">
              <Pila mood="sleep" size={120} />
              <p className="max-w-sm text-sm text-muted">
                Nenhuma conta ainda. Use <strong className="text-foreground">Conectar banco</strong> (Open
                Finance via Pluggy) ou <strong className="text-foreground">Importar OFX</strong> com um extrato
                baixado do banco.
              </p>
            </div>
          </Card>
        )}

        {connections?.map((c) => {
          const [status, label] = STATUS[c.status] ?? (["warn", c.status] as [Status, string]);
          return (
            <Card key={c.id} data-enter className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {c.institution_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.institution_logo_url} alt="" className="size-9 rounded-chip bg-surface-2 object-contain" />
                ) : (
                  <IconBadge icon={Landmark} color="var(--cat-fun)" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold">{c.institution_name}</h2>
                  <p className="text-xs text-muted">Último sync: {dateTime(c.last_synced_at)}</p>
                </div>
                <Pill status={status}>{label}</Pill>
                <Button variant="danger" onClick={() => setRemoving(c)}>
                  <Trash2 />
                  Remover
                </Button>
              </div>
              {c.last_sync_error && <ErrorNote>{c.last_sync_error}</ErrorNote>}
              <AccountList accounts={c.accounts} cards={cards} onClosingDay={saveClosingDay} />
            </Card>
          );
        })}

        {manual.length > 0 && (
          <Card data-enter className="grid gap-4">
            <div className="flex items-center gap-3">
              <IconBadge icon={FileUp} color="var(--cat-fin)" />
              <h2 className="font-semibold">Importadas por OFX</h2>
            </div>
            <AccountList accounts={manual} cards={cards} onClosingDay={saveClosingDay} />
          </Card>
        )}

        {connections && (
          <Card data-enter className="flex items-start gap-3">
            <IconBadge icon={FlaskConical} color="var(--cat-care)" size="sm" className="mt-0.5" />
            <label className="grid flex-1 gap-1 text-sm">
              <span className="flex items-center justify-between gap-3 font-semibold">
                Mostrar bancos de teste da Pluggy
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={sandbox}
                  onChange={(e) => setSandbox(e.target.checked)}
                />
              </span>
              <span className="text-muted">
                Para experimentar com o Pluggy Bank (usuário <code className="font-semibold">user-ok</code>,
                senha <code className="font-semibold">password-ok</code>). Desmarcado, a conexão usa o
                MeuPluggy: vincule seus bancos antes em{" "}
                <a
                  href="https://meu.pluggy.ai"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-accent underline underline-offset-2"
                >
                  meu.pluggy.ai
                </a>
                .
              </span>
            </label>
          </Card>
        )}
      </div>

      {removing && (
        <Dialog title={`Remover ${removing.institution_name}?`} onClose={() => setRemoving(null)}>
          {(close) => (
            <div className="grid gap-5">
              <p className="text-sm text-muted">
                Apaga as contas e transações deste banco neste computador e encerra o acesso na Pluggy. Não dá
                para desfazer; para voltar, conecte o banco de novo.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => close()}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const target = removing;
                    close(() => {
                      setRemoving(null);
                      removeConnection(target).catch((e) => setError(e.message));
                    });
                  }}
                >
                  <Trash2 />
                  Remover banco
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

function Total({
  icon,
  color,
  label,
  value,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-card-edge bg-surface px-4 py-3">
      <IconBadge icon={icon} color={color} size="sm" />
      <span className="text-sm text-muted">{label}</span>
      <span className="ml-auto text-[17px] font-medium tabular">{money(value)}</span>
    </div>
  );
}

function AccountList({
  accounts,
  cards,
  onClosingDay,
}: {
  accounts: Account[];
  cards: Map<number, CreditCardInfo>;
  onClosingDay: (account: Account, day: number | null) => Promise<void>;
}) {
  if (accounts.length === 0)
    return <p className="text-sm text-muted">As contas aparecem depois do primeiro sync.</p>;
  return (
    <ul className="grid divide-y divide-border">
      {accounts.map((a) => {
        const [icon, color] = ACCOUNT_ICON[a.type] ?? ACCOUNT_ICON.OTHER;
        const isCard = a.type === "CREDIT_CARD";
        const limit = a.credit_limit ? Number(a.credit_limit) : null;
        const used = isCard && limit ? Math.abs(Number(a.balance)) / limit : null;
        const usedStatus: Status | null = used === null ? null : used > 0.9 ? "bad" : used > 0.6 ? "warn" : "ok";
        return (
          <li key={a.id} className="grid gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <IconBadge icon={icon} color={color} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.name}</p>
                <p className="text-xs text-muted">{ACCOUNT_TYPE_LABEL[a.type]}</p>
              </div>
              <div className="shrink-0 text-right tabular">
                <p className={cx("font-medium", !isCard && Number(a.balance) < 0 && "text-negative")}>
                  {money(a.balance)}
                </p>
                {isCard && a.bill_due_date && (
                  <p className="text-xs font-semibold text-foreground">vence {shortDate(a.bill_due_date)}</p>
                )}
                {limit !== null && <p className="text-xs text-muted">limite {money(limit)}</p>}
              </div>
            </div>
            {used !== null && usedStatus && (
              <div className="grid gap-1 pl-12">
                <Meter thin value={used} color={STATUS_COLOR[usedStatus]} label={`${percent(used)} do limite usado`} />
                <p className="text-[11px] text-muted tabular">{percent(used)} do limite usado</p>
              </div>
            )}
            {isCard && <ClosingDay account={a} card={cards.get(a.id)} onSave={(day) => onClosingDay(a, day)} />}
          </li>
        );
      })}
    </ul>
  );
}

/** Dia em que os ciclos começam: o escolhido pelo usuário ou o fechamento do cartão principal. */
function CycleStart({ cycle, onSave }: { cycle: CycleInfo; onSave: (day: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const day = cycle.start_day;

  return (
    <Card data-enter className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <IconBadge icon={CalendarRange} color="var(--cat-fin)" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Ciclo</h2>
          <p className="text-xs text-muted">
            {day
              ? `Do dia ${day} até o dia ${day === 1 ? "último" : day - 1} do mês seguinte, escolhido por você.`
              : cycle.reference_card
                ? `Segue o fechamento da fatura do ${cycle.reference_card}.`
                : "Mês do calendário (nenhum cartão com faturas ainda)."}{" "}
            Ciclo atual: {cycleRange(cycle)}.
          </p>
        </div>
        {!editing && (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(day ? String(day) : "");
              setEditing(true);
            }}
          >
            {day ? "Mudar o dia" : "Escolher um dia"}
          </Button>
        )}
      </div>
      {editing && (
        <form
          className="flex flex-wrap items-center gap-2 pl-12"
          onSubmit={async (e) => {
            e.preventDefault();
            const value = Number(draft);
            if (!Number.isInteger(value) || value < 1 || value > 28) {
              setError("Use um dia entre 1 e 28 (todo mês tem esse dia).");
              return;
            }
            await onSave(value);
            setError(null);
            setEditing(false);
          }}
        >
          <label htmlFor="cycle-start" className="text-sm text-muted">
            Começa no dia
          </label>
          <input
            id="cycle-start"
            autoFocus
            inputMode="numeric"
            className={cx(inputClass, "min-h-9 w-20 text-right tabular")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" variant="primary" className="min-h-9">
            Salvar
          </Button>
          {day !== null && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-9"
              onClick={async () => {
                await onSave(null);
                setEditing(false);
              }}
            >
              Seguir a fatura do cartão
            </Button>
          )}
          <Button type="button" variant="ghost" className="min-h-9" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
          <p className="w-full text-xs text-muted">
            Escolha o dia seguinte ao que você costuma pagar as contas. Muda a divisão de todos os ciclos, inclusive os
            passados; as compras no cartão continuam no ciclo em que a fatura fecha.
          </p>
          {error && <p className="w-full text-xs font-semibold text-negative">{error}</p>}
        </form>
      )}
    </Card>
  );
}

/** Dia de fechamento do cartão: o estimado pelas faturas ou o escolhido pelo usuário. */
function ClosingDay({
  account,
  card,
  onSave,
}: {
  account: Account;
  card: CreditCardInfo | undefined;
  onSave: (day: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const day = account.closing_day ?? card?.estimated_closing_day ?? null;
  const id = `closing-${account.id}`;

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 pl-12"
        onSubmit={async (e) => {
          e.preventDefault();
          const value = Number(draft);
          if (!Number.isInteger(value) || value < 1 || value > 31) {
            setError("Use um dia entre 1 e 31.");
            return;
          }
          await onSave(value);
          setError(null);
          setEditing(false);
        }}
      >
        <label htmlFor={id} className="text-sm text-muted">
          Fecha no dia
        </label>
        <input
          id={id}
          autoFocus
          inputMode="numeric"
          className={cx(inputClass, "min-h-9 w-20 text-right tabular")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="primary" className="min-h-9">
          Salvar
        </Button>
        {account.closing_day !== null && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-9"
            onClick={async () => {
              await onSave(null);
              setEditing(false);
            }}
          >
            Usar o estimado
          </Button>
        )}
        <Button type="button" variant="ghost" className="min-h-9" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
        {error && <p className="w-full text-xs font-semibold text-negative">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-12 text-xs text-muted">
      <span>
        {day === null ? (
          "Fechamento desconhecido (sem faturas ainda)"
        ) : (
          <>
            Fecha no dia <strong className="font-semibold text-foreground tabular">{day}</strong>
            {account.closing_day !== null ? ", definido por você" : ", estimado pelas faturas"}
          </>
        )}
      </span>
      {card?.is_cycle_reference && (
        <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-foreground">define os ciclos</span>
      )}
      <button
        type="button"
        className="rounded-chip px-1.5 py-0.5 font-semibold text-accent hover:bg-surface-2"
        onClick={() => {
          setDraft(day ? String(day) : "");
          setEditing(true);
        }}
      >
        Ajustar
      </button>
    </div>
  );
}
