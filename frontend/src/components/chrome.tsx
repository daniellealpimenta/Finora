"use client";

import { Check, Moon, Sun, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FULL, gsap, motion, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { dismissToast, useSyncing, useToasts, type Toast } from "@/lib/signals";
import { playCoin, setSoundOn, soundOn } from "@/lib/sound";
import { Pila } from "./pila";
import { IconButton, cx } from "./ui";

/** Desenho da moeda-focinho (viewBox 64): o mesmo do ícone do app e do favicon, sem o fundo. */
export function CoinFace() {
  return (
    <>
      <circle cx="32" cy="32" r="30" fill="var(--coin)" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="var(--coin-line)" strokeWidth="2.2" opacity="0.45" />
      <ellipse cx="32" cy="33" rx="16" ry="12" fill="#ebcf98" stroke="var(--coin-line)" strokeWidth="3.4" />
      <ellipse cx="26.2" cy="33" rx="2.8" ry="4.3" fill="var(--coin-line)" />
      <ellipse cx="37.8" cy="33" rx="2.8" ry="4.3" fill="var(--coin-line)" />
    </>
  );
}

/** Logo: a moeda-focinho. Dá um giro ao abrir o app e gira como moeda enquanto sincroniza. */
export function CoinMark({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  const coin = useRef<SVGSVGElement>(null);
  const syncing = useSyncing();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        if (syncing) {
          gsap.to(coin.current, { rotationY: "+=360", duration: motion.spin.duration, ease: "none", repeat: -1 });
          return;
        }
        gsap.fromTo(coin.current, { rotationY: 0 }, { rotationY: 360, duration: motion.flip.duration, ease: motion.flip.ease });
      });
      return () => mm.revert();
    },
    { dependencies: [syncing], revertOnUpdate: true },
  );

  return (
    <span className={cx("grid shrink-0 place-items-center [perspective:200px]", className)} aria-hidden>
      <svg ref={coin} viewBox="0 0 64 64" className={size === "lg" ? "size-14" : "size-8"}>
        <CoinFace />
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

/** Liga e desliga o "tlim" de moeda. Ao ligar, toca uma vez para você ouvir como é. */
export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(soundOn()), []);
  return (
    <IconButton
      className={className}
      label={on ? "Desligar som de moeda" : "Ligar som de moeda"}
      aria-pressed={on}
      onClick={() => {
        setSoundOn(!on);
        setOn(!on);
        if (!on) playCoin(true);
      }}
    >
      {on ? <Volume2 /> : <VolumeX />}
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
      {toast.mood ? (
        <Pila mood={toast.mood} size={28} className="-my-1" />
      ) : (
        <span
          className={cx(
            "mt-px grid size-5 shrink-0 place-items-center rounded-full text-background [&_svg]:size-3",
            bad ? "bg-negative" : "bg-positive",
          )}
          aria-hidden
        >
          {bad ? <TriangleAlert strokeWidth={3} /> : <Check strokeWidth={3} />}
        </span>
      )}
      <span className={cx(toast.mood && "self-center")}>{toast.message}</span>
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
