"use client";

import { Check, Moon, Sun, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FULL, gsap, motion, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { dismissToast, useSyncing, useToasts, type Toast } from "@/lib/signals";
import { IconButton, cx } from "./ui";

/** Logo: um cofre cujo disco destrava ao abrir o app e gira enquanto sincroniza. */
export function VaultMark({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  const dial = useRef<SVGGElement>(null);
  const syncing = useSyncing();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        if (syncing) {
          gsap.to(dial.current, {
            rotation: "+=360",
            svgOrigin: "12 12",
            duration: motion.spin.duration,
            ease: "none",
            repeat: -1,
          });
          return;
        }
        gsap
          .timeline()
          .to(dial.current, { ...motion.dial, svgOrigin: "12 12" })
          .to(dial.current, { ...motion.dial, rotation: 0, svgOrigin: "12 12" });
      });
      return () => mm.revert();
    },
    { dependencies: [syncing], revertOnUpdate: true },
  );

  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center bg-accent text-accent-fg",
        size === "lg" ? "size-14 rounded-card" : "size-8 rounded-[9px]",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        className={cx("overflow-visible", size === "lg" ? "size-8" : "size-5")}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2.5" y="2.5" width="19" height="19" rx="3" />
        <g ref={dial}>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 7.5v2M12 14.5v2M7.5 12h2M14.5 12h2" />
        </g>
      </svg>
    </span>
  );
}

function currentTheme(): "light" | "dark" {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const icon = useRef<HTMLSpanElement>(null);
  // Começa indefinido no servidor; o ícone certo aparece no primeiro clique ou após montar
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => setTheme(currentTheme()), []);

  const { contextSafe } = useGSAP();
  const toggle = contextSafe(() => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("mf_theme", next);
    } catch {
      /* storage indisponível: vale só nesta aba */
    }
    setTheme(next);
    if (!prefersReducedMotion())
      gsap.fromTo(icon.current, { rotation: -180 }, { rotation: 0, ...motion.theme });
  });

  return (
    <IconButton
      label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
      onClick={toggle}
    >
      <span ref={icon} className="grid place-items-center">
        {theme === "dark" ? <Sun /> : <Moon />}
      </span>
    </IconButton>
  );
}

const TOAST_MS = 3000;

function ToastItem({ toast }: { toast: Toast }) {
  const el = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = prefersReducedMotion();
      const tl = gsap.timeline({ onComplete: () => dismissToast(toast.id) });
      if (reduced) tl.set(el.current, { autoAlpha: 1 });
      else tl.fromTo(el.current, { y: motion.toastIn.y, autoAlpha: 0 }, { ...motion.toastIn, y: 0, autoAlpha: 1 });
      tl.to(
        el.current,
        reduced ? { autoAlpha: 0, duration: 0 } : { ...motion.toastOut, autoAlpha: 0 },
        `+=${TOAST_MS / 1000}`,
      );
    },
    { scope: el },
  );

  const bad = toast.tone === "bad";
  return (
    <div
      ref={el}
      role="status"
      className="invisible flex max-w-sm items-start gap-2.5 rounded-control bg-foreground px-3.5 py-2.5 text-sm font-medium text-background"
    >
      <span
        className={cx(
          "mt-px grid size-5 shrink-0 place-items-center rounded-full text-background [&_svg]:size-3",
          bad ? "bg-negative" : "bg-positive",
        )}
        aria-hidden
      >
        {bad ? <TriangleAlert strokeWidth={3} /> : <Check strokeWidth={3} />}
      </span>
      <span>{toast.message}</span>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts();
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-[calc(148px+env(safe-area-inset-bottom,0px))] z-[60] grid justify-items-end gap-2 sm:right-6 sm:bottom-24"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
