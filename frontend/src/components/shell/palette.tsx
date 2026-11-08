"use client";

import { LogOut, MonitorSmartphone, Moon, RefreshCw, Search, UserRound, Volume2, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { toggleTheme } from "@/components/chrome";
import { cx, tone } from "@/components/ui";
import { FULL, gsap, useGSAP } from "@/lib/motion";
import { playSound, setSoundOn, soundOn } from "@/lib/sound";
import { syncNow } from "@/lib/sync";
import { NAV } from "./nav";
import { closePalette, openPalette, usePaletteOpen } from "./palette-store";

type Command = { group: string; label: string; icon: LucideIcon; color?: string; hint?: string; run: () => void };

/**
 * Paleta de comandos (⌘K ou Ctrl+K): ir para uma seção, sincronizar, trocar tema e som, perfil e
 * sair. É o atalho para tudo que antes ficava preso na barra do topo.
 */
export function CommandPalette({ onLogout }: { onLogout: () => void }) {
  const open = usePaletteOpen();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return createPortal(<Panel router={router} onLogout={onLogout} />, document.body);
}

function Panel({ router, onLogout }: { router: ReturnType<typeof useRouter>; onLogout: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      ...NAV.map((n) => ({ group: "Ir para", label: n.label, icon: n.icon, color: n.color, run: () => router.push(n.href) })),
      { group: "Fazer", label: "Sincronizar agora", icon: RefreshCw, color: "var(--accent)", run: () => void syncNow() },
      { group: "Ajustes", label: "Trocar tema (claro ou escuro)", icon: Moon, run: () => toggleTheme() },
      {
        group: "Ajustes",
        label: soundOn() ? "Desligar os sons" : "Ligar os sons",
        icon: Volume2,
        run: () => {
          const next = !soundOn();
          setSoundOn(next);
          if (next) playSound("coin");
        },
      },
      { group: "Conta", label: "Perfil", icon: UserRound, run: () => router.push("/perfil") },
      {
        group: "Conta",
        label: "Exportar ou importar dados (outro computador)",
        icon: MonitorSmartphone,
        run: () => router.push("/perfil#outro-computador"),
      },
      { group: "Conta", label: "Sair", icon: LogOut, color: "var(--negative)", run: onLogout },
    ],
    [router, onLogout],
  );
  const term = q.trim().toLowerCase();
  const shown = commands.filter((c) => !term || `${c.label} ${c.group}`.toLowerCase().includes(term));
  const current = Math.min(sel, Math.max(0, shown.length - 1));

  useGSAP(
    () => {
      playSound("whoosh");
      input.current?.focus();
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from("[data-veil]", { autoAlpha: 0, duration: 0.2 });
        gsap.from("[data-box]", { y: -14, scale: 0.97, autoAlpha: 0, duration: 0.32, ease: "back.out(1.6)" });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  function run(c: Command | undefined) {
    closePalette();
    c?.run();
  }

  let lastGroup = "";
  return (
    <div ref={root} className="fixed inset-0 z-50">
      <div data-veil className="absolute inset-0 bg-black/45" onClick={closePalette} aria-hidden />
      <div
        data-box
        role="dialog"
        aria-modal="true"
        aria-label="Buscar e comandos"
        className="absolute top-[14vh] left-1/2 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-card border border-card-edge bg-surface"
      >
        <label className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel(Math.min(shown.length - 1, current + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel(Math.max(0, current - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(shown[current]);
              } else if (e.key === "Escape") closePalette();
            }}
            placeholder="Ir para uma seção ou fazer algo…"
            aria-label="Buscar"
            aria-controls="comandos"
            aria-activedescendant={shown[current] ? `comando-${current}` : undefined}
            className="min-h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          <kbd className="rounded-[5px] border border-border px-1.5 text-xs text-muted">Esc</kbd>
        </label>
        <ul id="comandos" role="listbox" className="grid max-h-[50vh] gap-0.5 overflow-y-auto p-1.5">
          {shown.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted">Nada com &quot;{q}&quot;. Tente &quot;cofrinho&quot; ou &quot;tema&quot;.</li>
          )}
          {shown.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            const Icon = c.icon;
            return (
              <li key={`${c.group}-${c.label}`} role="presentation" className="grid">
                {head && <span className="px-3 pt-2 pb-1 text-xs font-semibold text-muted">{head}</span>}
                <button
                  type="button"
                  id={`comando-${i}`}
                  role="option"
                  aria-selected={i === current}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => run(c)}
                  style={tone(c.color ?? "var(--muted)")}
                  className={cx(
                    "flex min-h-11 items-center gap-3 rounded-control px-3 text-left text-sm font-medium",
                    i === current && "bg-surface-2",
                  )}
                >
                  <Icon className="size-4 text-[var(--c)]" strokeWidth={2.2} aria-hidden />
                  {c.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
