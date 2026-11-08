"use client";

import { ArrowRight, CloudOff, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { IconButton, tone } from "@/components/ui";
import { dismiss, isDismissed } from "@/lib/dismiss";
import { shortDate } from "@/lib/format";
import { loadStaleBanks, type StaleBank } from "@/lib/stale";

/**
 * Aviso de banco parado: sincronizar não traz nada novo quando o banco parou de mandar dados
 * para o MeuPluggy (consentimento do Open Finance vencido, por exemplo). Sem isto, o painel
 * mostra dados velhos como se estivessem em dia.
 */
export function StaleNote() {
  const [banks, setBanks] = useState<StaleBank[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    void loadStaleBanks().then(setBanks);
  }, []);

  // Fechado vale para estes bancos parados nestas datas: se outro banco parar, o aviso volta
  const key = `stale:${banks.map((b) => `${b.bank}@${b.since}`).join(",")}`;
  if (!banks.length || hidden || isDismissed(key)) return null;
  const names = banks.map((b) => b.bank);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : names[0];
  return (
    <div
      data-enter
      role="status"
      style={tone("var(--warning)")}
      className="tint flex flex-wrap items-start gap-3 rounded-card py-3 pr-2 pl-4 text-sm"
    >
      <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-foreground">
        <b>
          {list} sem transações novas desde {shortDate(banks[banks.length - 1].since)}
          {banks.length > 1 && " ou antes"}.
        </b>{" "}
        Se você usou {banks.length > 1 ? "esses bancos" : "esse banco"} depois disso, a ligação com o MeuPluggy
        pode ter parado. Reconecte em meu.pluggy.ai.
      </p>
      <Link href="/contas" className="flex min-h-10 items-center gap-1 font-semibold">
        Ver contas
        <ArrowRight className="size-4" aria-hidden />
      </Link>
      <IconButton
        label="Fechar este aviso"
        onClick={() => {
          dismiss(key);
          setHidden(true);
        }}
        className="-my-1 text-[var(--c)] hover:bg-[color-mix(in_oklab,var(--c)_14%,transparent)]"
      >
        <X />
      </IconButton>
    </div>
  );
}
