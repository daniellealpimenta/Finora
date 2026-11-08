"use client";

import { MoreHorizontal, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cx, tone } from "@/components/ui";
import { FULL, gsap, useGSAP } from "@/lib/motion";
import { NAV } from "./nav";

/**
 * Celular: a doca vira uma barra flutuante com 4 seções e um "Mais" (no máximo 5 abas, rótulo de
 * 12px). O "Mais" abre Desejos, Contas e Assistente.
 */
export function MobileNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const more = NAV.filter((item) => item.mobile === "more");
  const moreActive = more.some((item) => item.href === pathname);
  const sheet = useRef<HTMLDivElement>(null);

  // Fecha ao trocar de página e com Esc
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useGSAP(
    () => {
      if (!open) return;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from(sheet.current, { y: 16, autoAlpha: 0, duration: 0.3, ease: "power3.out" });
      });
      return () => mm.revert();
    },
    { dependencies: [open] },
  );

  return (
    <div className="sm:hidden">
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={sheet}
            id="mais-secoes"
            className="fixed right-3 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-30 grid w-56 gap-1 rounded-card border border-card-edge bg-surface p-2"
          >
            {more.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={tone(item.color)}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-semibold",
                    active ? "tint text-foreground" : "hover:bg-surface-2",
                  )}
                >
                  <Icon className="size-[18px] text-[var(--c)]" strokeWidth={2.2} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
      <nav
        data-mobile
        aria-label="Seções"
        className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom,0px))] z-30 grid grid-cols-5 rounded-[24px] border border-card-edge bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-1.5 py-1.5"
      >
        {NAV.filter((item) => item.mobile === "bar").map((item) => (
          <MobileTab
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            color={item.color}
            active={pathname === item.href}
          />
        ))}
        <MobileTab
          label="Mais"
          icon={MoreHorizontal}
          color="var(--muted)"
          active={moreActive || open}
          onClick={() => setOpen(!open)}
          expanded={open}
        />
      </nav>
    </div>
  );
}

function MobileTab({
  href,
  label,
  icon: Icon,
  color,
  active,
  onClick,
  expanded,
}: {
  href?: string;
  label: string;
  icon: LucideIcon;
  color: string;
  active: boolean;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const className = cx(
    "grid min-h-11 min-w-0 justify-items-center gap-0.5 rounded-[18px] py-1 text-xs font-semibold",
    active ? "text-foreground" : "text-muted",
  );
  const inner = (
    <>
      <span
        data-icon
        className={cx(
          "grid h-7 w-12 place-items-center rounded-full text-[var(--c)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]",
          active && "tint",
        )}
      >
        <Icon className="size-[18px]" strokeWidth={2.2} />
      </span>
      <span className="max-w-full truncate">{label}</span>
    </>
  );
  if (!href)
    return (
      <button
        type="button"
        style={tone(color)}
        aria-expanded={expanded}
        aria-controls="mais-secoes"
        onClick={onClick}
        className={className}
      >
        {inner}
      </button>
    );
  return (
    <Link href={href} style={tone(color)} aria-current={active ? "page" : undefined} className={className}>
      {inner}
    </Link>
  );
}
