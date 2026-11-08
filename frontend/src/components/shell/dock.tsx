"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { cx, tone } from "@/components/ui";
import { FULL, gsap, useGSAP } from "@/lib/motion";
import { NAV } from "./nav";
import { openPalette } from "./palette-store";

const BASE = 48;
const GROW = 22;
const REACH = 130;

/**
 * Seções numa doca flutuante embaixo, como a do Mac (desktop). Os ícones crescem perto do
 * ponteiro (lei de Fitts); a seção ativa ganha um ponto embaixo. No celular quem manda é a
 * MobileNav.
 */
export function Dock({ pathname }: { pathname: string }) {
  const dock = useRef<HTMLElement>(null);

  const { contextSafe } = useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from(dock.current, { y: 90, duration: 0.7, ease: "back.out(1.4)", delay: 0.2 });
      });
      return () => mm.revert();
    },
    { scope: dock },
  );

  // Aumenta cada item pela distância do ponteiro até o centro dele
  const magnify = contextSafe((x: number | null) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    dock.current?.querySelectorAll<HTMLElement>("[data-dock-item]").forEach((item) => {
      const r = item.getBoundingClientRect();
      const near = x === null ? 0 : Math.max(0, 1 - Math.abs(x - (r.left + r.width / 2)) / REACH);
      gsap.to(item, { width: BASE + near * GROW, height: BASE + near * GROW, duration: 0.25, ease: "power3.out", overwrite: "auto" });
    });
  });

  const item = cx(
    "group relative grid shrink-0 place-items-center rounded-[15px] bg-surface-2 text-[var(--c)]",
    "transition-colors duration-[var(--dur-fast)] hover:bg-[color-mix(in_oklab,var(--c)_16%,var(--surface-2))]",
  );
  const label = cx(
    "pointer-events-none absolute bottom-[calc(100%+10px)] rounded-chip bg-foreground px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-background",
    "opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100 group-focus-visible:opacity-100",
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(14px+env(safe-area-inset-bottom,0px))] z-30 hidden justify-center sm:flex">
      <nav
        ref={dock}
        aria-label="Seções"
        onMouseMove={(e) => magnify(e.clientX)}
        onMouseLeave={() => magnify(null)}
        className="pointer-events-auto flex h-[68px] items-end gap-1.5 rounded-[24px] border border-card-edge bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] px-2.5 py-2.5"
      >
        {NAV.map((nav, i) => {
          const active = pathname === nav.href;
          const Icon = nav.icon;
          return (
            <span key={nav.href} className="flex items-end gap-1.5">
              {/* O Assistente fica separado das seções de dinheiro */}
              {i === NAV.length - 1 && <span className="mx-0.5 h-8 w-px self-center bg-border" aria-hidden />}
              <Link
                href={nav.href}
                data-dock-item
                aria-label={nav.label}
                aria-current={active ? "page" : undefined}
                style={{ ...tone(nav.color), width: BASE, height: BASE }}
                className={item}
              >
                <Icon className="size-[22px]" strokeWidth={2.2} />
                <span className={label}>{nav.label}</span>
                {active && <span className="absolute -bottom-[7px] size-[5px] rounded-full bg-foreground" aria-hidden />}
              </Link>
            </span>
          );
        })}
        <span className="mx-0.5 h-8 w-px self-center bg-border" aria-hidden />
        <button
          type="button"
          data-dock-item
          onClick={openPalette}
          aria-label="Buscar e comandos (⌘K)"
          style={{ ...tone("var(--muted)"), width: BASE, height: BASE }}
          className={item}
        >
          <Search className="size-[22px]" strokeWidth={2.2} />
          <span className={label}>Buscar · ⌘K</span>
        </button>
      </nav>
    </div>
  );
}
