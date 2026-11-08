"use client";

import { LayoutGrid, MoreHorizontal, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { IconButton } from "@/components/ui";
import { FULL, gsap, useGSAP } from "@/lib/motion";
import { playSound } from "@/lib/sound";

export type MenuAction = { label: string; icon: "edit" | "reset" | "recap"; onClick: () => void; disabled?: boolean };

const ICONS: Record<MenuAction["icon"], ReactNode> = {
  edit: <LayoutGrid />,
  reset: <RotateCcw />,
  recap: <Sparkles />,
};

/** Os três pontinhos ao lado do seletor de ciclo: personalizar, voltar ao padrão e o fechamento. */
export function PanelMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

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
        gsap.from("[data-menu]", { y: -8, scale: 0.96, autoAlpha: 0, transformOrigin: "top right", duration: 0.28, ease: "back.out(1.8)" });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [open] },
  );

  return (
    <div ref={root} className="relative">
      <IconButton
        label="Mais opções do painel"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          playSound("tap");
          setOpen(!open);
        }}
        className="border border-border bg-surface"
      >
        <MoreHorizontal />
      </IconButton>
      {open && (
        <div
          data-menu
          role="menu"
          className="absolute top-[calc(100%+8px)] right-0 z-40 grid w-64 gap-0.5 rounded-card border border-card-edge bg-surface p-1.5"
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                playSound("tap");
                a.onClick();
              }}
              className="flex min-h-11 items-center gap-3 rounded-control px-3 text-left text-sm font-semibold hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4 [&_svg]:text-muted"
            >
              {ICONS[a.icon]}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
