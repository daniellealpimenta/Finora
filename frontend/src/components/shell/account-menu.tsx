"use client";

import { CloudOff, LogOut, MonitorSmartphone, Moon, RefreshCw, Sun, UserRound, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { currentTheme, toggleTheme } from "@/components/chrome";
import { cx } from "@/components/ui";
import type { Me } from "@/lib/api";
import { FULL, gsap, useGSAP } from "@/lib/motion";
import { useSyncing } from "@/lib/signals";
import { playSound, setSoundOn, soundOn } from "@/lib/sound";
import { loadStaleBanks, type StaleBank } from "@/lib/stale";
import { syncNow } from "@/lib/sync";

/**
 * O avatar no canto: tudo que ficava na barra do topo (sincronizar, tema, som, perfil, sair) e
 * os avisos de banco parado. Um ponto no avatar avisa quando há algo para ver.
 */
export function AccountMenu({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [sound, setSound] = useState(true);
  const [stale, setStale] = useState<StaleBank[]>([]);
  const syncing = useSyncing();
  const root = useRef<HTMLDivElement>(null);
  const name = me.username ?? me.email.split("@")[0];

  // Os avisos voltam a ser lidos depois de cada sync (banco reconectado some da lista)
  useEffect(() => {
    if (!syncing) void loadStaleBanks().then(setStale);
  }, [syncing]);

  // Fecha com clique fora e com Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useGSAP(
    () => {
      if (!open) return;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-menu]", { y: -8, scale: 0.96, autoAlpha: 0, transformOrigin: "top right", duration: 0.3, ease: "back.out(1.8)" });
        gsap.from("[data-menu] [role=menuitem]", { x: 8, autoAlpha: 0, stagger: 0.025, duration: 0.25, delay: 0.05 });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [open] },
  );

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => {
          // Tema e som podem ter mudado pelo ⌘K: lê de novo ao abrir
          setTheme(currentTheme());
          setSound(soundOn());
          setOpen(!open);
          playSound("tap");
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${name}: sincronizar, tema, sons, perfil e sair${stale.length ? " (há avisos)" : ""}`}
        className="relative grid size-11 place-items-center rounded-full border-2 border-border bg-surface font-display text-lg font-bold uppercase transition-colors duration-[var(--dur-fast)] hover:border-accent"
      >
        {name.slice(0, 1)}
        {stale.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-warning" aria-hidden />
        )}
      </button>

      {open && (
        <div
          data-menu
          role="menu"
          className="absolute top-[calc(100%+8px)] right-0 z-40 grid w-[290px] gap-0.5 rounded-card border border-card-edge bg-surface p-2"
        >
          <div className="grid px-3 pt-2 pb-3">
            <b className="truncate">{me.username ?? name}</b>
            <span className="truncate text-xs text-muted">{me.email}</span>
          </div>
          {item({
            key: "sync",
            icon: <RefreshCw className={cx(syncing && "animate-spin")} />,
            label: syncing ? "Sincronizando…" : "Sincronizar agora",
            disabled: syncing,
            onClick: () => void syncNow(),
          })}
          {item({
            key: "theme",
            icon: theme === "dark" ? <Sun /> : <Moon />,
            label: theme === "dark" ? "Tema claro" : "Tema escuro",
            keepOpen: true,
            onClick: () => setTheme(toggleTheme()),
          })}
          {item({
            key: "sound",
            icon: sound ? <Volume2 /> : <VolumeX />,
            label: sound ? "Desligar os sons" : "Ligar os sons",
            keepOpen: true,
            onClick: () => {
              setSoundOn(!sound);
              setSound(!sound);
              if (!sound) playSound("coin", true);
            },
          })}
          {stale.length > 0 && (
            <>
              <hr className="mx-2 my-1 border-border" />
              {stale.map((b) => (
                <Link
                  key={b.bank}
                  href="/contas"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-semibold text-warning hover:bg-surface-2"
                >
                  <CloudOff className="size-4" aria-hidden />
                  <span className="flex-1">{b.bank} sem dados novos</span>
                  <span className="text-xs font-medium text-muted">{b.days} dias</span>
                </Link>
              ))}
            </>
          )}
          <hr className="mx-2 my-1 border-border" />
          <Link
            href="/perfil#outro-computador"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-semibold hover:bg-surface-2 [&_svg]:size-4"
          >
            <MonitorSmartphone aria-hidden />
            Usar em outro computador
          </Link>
          <Link
            href="/perfil"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-semibold hover:bg-surface-2 [&_svg]:size-4"
          >
            <UserRound aria-hidden />
            Perfil
          </Link>
          {item({ key: "logout", icon: <LogOut />, label: "Sair", onClick: onLogout })}
        </div>
      )}
    </div>
  );

  // Função que devolve o botão, não um componente: o mesmo nó sobrevive aos redesenhos (o foco
  // do teclado não se perde ao trocar o tema com o menu aberto)
  function item({
    key,
    icon,
    label,
    onClick,
    disabled,
    keepOpen,
  }: {
    key: string;
    icon: ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    keepOpen?: boolean;
  }) {
    return (
      <button
        key={key}
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => {
          if (!keepOpen) setOpen(false);
          playSound("tap");
          onClick();
        }}
        className="flex min-h-11 items-center gap-3 rounded-control px-3 text-left text-sm font-semibold hover:bg-surface-2 disabled:opacity-60 [&_svg]:size-4"
      >
        {icon}
        {label}
      </button>
    );
  }
}
