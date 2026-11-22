"use client";

import { Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";

import { Button, Card, CardTitle, ErrorNote, Pill } from "@/components/ui";
import { api } from "@/lib/api";
import { notify } from "@/lib/signals";

type Access = { enabled: boolean; tailscale_ip: string | null; url: string | null; restart_needed: boolean };
type PairCode = { code: string; expires_at: string; url: string | null };
type Device = { id: number; name: string; created_at: string; last_seen_at: string | null };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca";

/** O QR que o app lê: o endereço da API na Tailscale e o código de 6 dígitos. */
export const pairLink = (url: string, code: string) =>
  `finora://parear?url=${encodeURIComponent(url)}&code=${code}`;

/**
 * Celular (Perfil): liga o acesso pela Tailscale, pareia o app finoraMobile por QR e lista os
 * aparelhos. A senha nunca vai para o celular: ele recebe um token próprio, que dá para revogar.
 */
export function PhoneCard() {
  const [access, setAccess] = useState<Access | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pair, setPair] = useState<PairCode | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([api<Access>("/devices/access"), api<Device[]>("/devices")]);
      setAccess(a);
      setDevices(d);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Contagem regressiva do código; vencido, o QR some
  useEffect(() => {
    if (!pair) return;
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(pair.expires_at).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        setPair(null);
        setQr(null);
        load(); // o celular pode ter acabado de parear
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [pair, load]);

  async function toggle() {
    if (!access) return;
    setBusy(true);
    try {
      const a = await api<Access>("/devices/access", {
        method: "PUT",
        body: JSON.stringify({ enabled: !access.enabled }),
      });
      setAccess(a);
      if (!a.enabled) {
        setPair(null);
        setQr(null);
      }
      notify(a.enabled ? "Acesso pelo celular ligado" : "Acesso pelo celular desligado");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function newCode() {
    setBusy(true);
    try {
      const p = await api<PairCode>("/devices/pair-code", { method: "POST" });
      setPair(p);
      setQr(p.url ? await QRCode.toDataURL(pairLink(p.url, p.code), { margin: 1, width: 220 }) : null);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: Device) {
    try {
      await api(`/devices/${d.id}`, { method: "DELETE" });
      notify(`${d.name} desconectado`);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Card data-enter>
      <CardTitle
        icon={Smartphone}
        color="var(--cat-care)"
        hint={access && <Pill status={access.enabled ? "ok" : "warn"}>{access.enabled ? "ligado" : "desligado"}</Pill>}
      >
        Celular
      </CardTitle>
      {error && (
        <div className="mb-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {access && (
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            O app Finora no celular lê os seus números deste computador pela Tailscale, uma rede
            privada e criptografada. Nada passa pela internet aberta, e o computador precisa estar
            com o Finora aberto.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={access.enabled ? "secondary" : "primary"} onClick={toggle} disabled={busy}>
              {access.enabled ? "Desligar acesso pelo celular" : "Ligar acesso pelo celular"}
            </Button>
            {access.enabled && (
              <Button onClick={newCode} disabled={busy || !access.tailscale_ip}>
                {pair ? "Gerar outro código" : "Parear um celular"}
              </Button>
            )}
          </div>

          {access.enabled && !access.tailscale_ip && (
            <div className="rounded-control bg-surface-2 p-4 text-sm">
              <p className="font-semibold">Tailscale não encontrada neste computador</p>
              <ol className="mt-2 grid list-decimal gap-1 pl-5 text-muted">
                <li>Instale a Tailscale (tailscale.com/download) neste computador e entre.</li>
                <li>Instale o app Tailscale no celular e entre com a mesma conta.</li>
                <li>Volte aqui: o botão de parear libera sozinho.</li>
              </ol>
              <Button variant="ghost" className="mt-2 min-h-9" onClick={load}>
                Verificar de novo
              </Button>
            </div>
          )}

          {access.restart_needed && (
            <p className="rounded-control bg-surface-2 p-3 text-sm">
              Feche e abra o Finora de novo para o celular conseguir entrar. No modo de
              desenvolvimento, rode a API com <code>FINORA_LISTEN_ALL=1</code> e{" "}
              <code>--host 0.0.0.0</code>.
            </p>
          )}

          {pair && (
            <div className="flex flex-wrap items-center gap-5 rounded-control bg-surface-2 p-4">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code para parear o celular" width={180} height={180} className="rounded-lg bg-white p-2" />
              )}
              <div className="grid gap-1">
                <span className="text-xs text-muted">No app Finora, toque em “Conectar ao meu Finora” e leia o QR. Ou digite:</span>
                <span className="font-mono text-sm break-all">{pair.url}</span>
                <span className="font-display text-4xl tracking-[0.2em] tabular">{pair.code}</span>
                <span className="text-xs text-muted">
                  Vale por {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
                </span>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <h3 className="text-xs text-muted">Aparelhos pareados</h3>
            {devices.length === 0 && <p className="text-sm text-muted">Nenhum ainda.</p>}
            <ul className="grid divide-y divide-border">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <div className="grid min-w-0 flex-1">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-xs text-muted">
                      Pareado em {when(d.created_at)} · visto {when(d.last_seen_at)}
                    </span>
                  </div>
                  <Button variant="danger" className="min-h-9" onClick={() => remove(d)}>
                    Desconectar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
