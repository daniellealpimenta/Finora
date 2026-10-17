"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Card, Empty, ErrorNote, PageHeader } from "@/components/ui";
import { api, type Account, type Connection, type SyncStatus } from "@/lib/api";
import { ACCOUNT_TYPE_LABEL, dateTime, money } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  UPDATED: "Atualizada",
  UPDATING: "Atualizando",
  LOGIN_ERROR: "Erro de login",
  OUTDATED: "Desatualizada",
  WAITING_USER_INPUT: "Aguardando você",
};

// Aplicação Pluggy em trial só cria itens do sandbox e do MeuPluggy
// (bancos reais -> 400 TRIAL_CLIENT_ITEM_CREATE_NOT_ALLOWED). Os bancos reais
// são conectados em https://meu.pluggy.ai e chegam aqui pelo conector MeuPluggy.
const MEU_PLUGGY_CONNECTOR_ID = 200;

export default function ContasPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [manual, setManual] = useState<Account[]>([]);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [conns, accounts, status] = await Promise.all([
      api<Connection[]>("/connections"),
      api<Account[]>("/accounts"),
      api<SyncStatus>("/sync/status"),
    ]);
    setConnections(conns);
    setManual(accounts.filter((a) => a.connection_id === null));
    setSync(status);
    return status;
  }, []);

  useEffect(() => {
    load().catch((e) => setError(String(e.message ?? e)));
  }, [load]);

  // Enquanto um sync roda, atualiza a tela a cada 2s
  useEffect(() => {
    if (!sync?.running) return;
    const timer = setInterval(async () => {
      const status = await load();
      if (!status.running) {
        clearInterval(timer);
        const r = status.last_result;
        if (status.last_error) setError(`Sincronização falhou: ${status.last_error}`);
        else if (r)
          setMessage(
            `Sincronizado: ${r.created} novas, ${r.updated} atualizadas, ${r.deleted} removidas.` +
              (r.errors.length ? ` Erros: ${r.errors.join("; ")}` : ""),
          );
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [sync?.running, load]);

  async function startSync() {
    setError(null);
    setMessage(null);
    setSync(await api<SyncStatus>("/sync", { method: "POST" }));
  }

  async function connectBank() {
    setError(null);
    setMessage(null);
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
          setMessage(`${item.connector?.name ?? "Banco"} conectado. Sincronizando…`);
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
    const ok = confirm(
      `Remover ${c.institution_name}?\n\nApaga as contas e transações dela neste computador e encerra o acesso na Pluggy.`,
    );
    if (!ok) return;
    await api(`/connections/${c.id}`, { method: "DELETE" });
    await load();
  }

  async function importOfx(file: File) {
    setError(null);
    setMessage(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api<{ account_name: string; created: number; skipped: number }>(
        "/import/ofx",
        { method: "POST", body: form },
      );
      setMessage(`${r.account_name}: ${r.created} transações importadas, ${r.skipped} já existiam.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <PageHeader
        title="Contas"
        actions={
          <>
            <Button onClick={startSync} disabled={sync?.running || connections.length === 0}>
              {sync?.running ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
            <Button onClick={() => fileRef.current?.click()}>Importar OFX</Button>
            <input
              ref={fileRef}
              type="file"
              accept=".ofx,.OFX"
              hidden
              onChange={(e) => e.target.files?.[0] && importOfx(e.target.files[0])}
            />
            <Button variant="primary" onClick={connectBank} disabled={connecting}>
              Conectar banco
            </Button>
          </>
        }
      />

      <label className="mb-4 flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
        Mostrar bancos de teste da Pluggy (Pluggy Bank: usuário <code>user-ok</code>, senha{" "}
        <code>password-ok</code>). Desmarcado, conecta pelo MeuPluggy: vincule seus bancos
        antes em{" "}
        <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer" className="underline">
          meu.pluggy.ai
        </a>
        .
      </label>

      <div className="mb-4 space-y-2">
        {error && <ErrorNote>{error}</ErrorNote>}
        {message && (
          <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">{message}</p>
        )}
      </div>

      {connections.length === 0 && manual.length === 0 ? (
        <Card>
          <Empty>
            Nenhuma conta ainda. Use <strong>Conectar banco</strong> (Open Finance via Pluggy) ou{" "}
            <strong>Importar OFX</strong> com um extrato baixado do banco.
          </Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {connections.map((c) => (
            <Card key={c.id}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                {c.institution_logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.institution_logo_url} alt="" className="h-8 w-8 rounded" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium">{c.institution_name}</h2>
                  <p className="text-xs text-muted">
                    {STATUS_LABEL[c.status] ?? c.status} · último sync: {dateTime(c.last_synced_at)}
                  </p>
                </div>
                <Button variant="danger" onClick={() => removeConnection(c)}>
                  Remover
                </Button>
              </div>
              {c.last_sync_error && <ErrorNote>{c.last_sync_error}</ErrorNote>}
              <AccountList accounts={c.accounts} />
            </Card>
          ))}
          {manual.length > 0 && (
            <Card>
              <h2 className="mb-3 font-medium">Importadas por OFX</h2>
              <AccountList accounts={manual} />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function AccountList({ accounts }: { accounts: Account[] }) {
  if (accounts.length === 0)
    return <p className="text-sm text-muted">Contas aparecem após o primeiro sync.</p>;
  return (
    <ul className="divide-y divide-border">
      {accounts.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate">{a.name}</p>
            <p className="text-xs text-muted">{ACCOUNT_TYPE_LABEL[a.type]}</p>
          </div>
          <div className="text-right tabular">
            <p className={Number(a.balance) < 0 ? "text-negative" : ""}>{money(a.balance)}</p>
            {a.credit_limit && (
              <p className="text-xs text-muted">limite {money(a.credit_limit)}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
