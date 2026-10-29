"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Pila } from "@/components/pila";
import { Button, buttonClass } from "@/components/ui";
import { api, type UpdateInfo } from "@/lib/api";

/**
 * Aviso de versão nova, abaixo da barra do topo. Só aparece no programa instalado (a API
 * responde `available: false` no modo web). Baixar abre o navegador com o instalador deste
 * sistema; a pessoa instala por cima e os dados continuam (ficam na pasta ManagerFinance).
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api<UpdateInfo>("/updates")
      .then((u) => u.available && setUpdate(u))
      .catch(() => {});
  }, []);

  if (!update?.download_url || !update.latest) return null;
  const latest = update.latest;
  const mac = update.download_url.endsWith(".dmg");

  function dismiss() {
    setUpdate(null);
    api("/updates/dismiss", { method: "POST", body: JSON.stringify({ version: latest }) }).catch(
      () => {},
    );
  }

  return (
    <div role="status" className="border-b border-border bg-surface-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <Pila mood="celebrate" size={40} className="shrink-0" />
        <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
          <p className="font-semibold">Saiu a versão {latest} do Finora!</p>
          <p className="text-xs text-muted">
            {downloading
              ? mac
                ? "Quando terminar de baixar: feche o Finora, abra o .dmg e arraste o Finora para Aplicativos (Substituir)."
                : "Quando terminar de baixar: abra o instalador. Ele fecha o Finora e instala por cima."
              : `Você está na ${update.current}. Seus dados e configurações continuam do jeito que estão.`}
            {update.notes_url && (
              <>
                {" "}
                <a
                  href={update.notes_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-accent underline underline-offset-2"
                >
                  O que mudou
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={update.download_url}
            target="_blank"
            rel="noreferrer"
            onClick={() => setDownloading(true)}
            className={buttonClass("primary", "min-h-9")}
          >
            <Download />
            {downloading ? "Baixar de novo" : "Baixar"}
          </a>
          <Button variant="ghost" className="min-h-9 px-2.5" onClick={dismiss} title="Agora não">
            <X />
            <span className="max-sm:sr-only">Agora não</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
