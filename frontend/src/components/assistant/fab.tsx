"use client";

import { Maximize2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Pila } from "@/components/pila";
import { IconButton, cx } from "@/components/ui";
import { gsap, motion, prefersReducedMotion, useGSAP } from "@/lib/motion";
import { ChatView } from "./chat";
import { useAssistant } from "./context";

/**
 * Botão redondo com o Pila no canto inferior direito: abre a conversa num painel, em qualquer
 * página. Na aba Assistente ele some (a conversa já está na tela).
 */
export function AssistantFab() {
  // No .exe (export estático, trailingSlash) o caminho chega como "/transacoes/"
  const pathname = usePathname().replace(/(.)\/$/, "$1");
  const { busy, turns } = useAssistant();
  const [open, setOpen] = useState(false);
  // Resposta que chegou com o painel fechado: um ponto no botão avisa
  const [unread, setUnread] = useState(false);
  const lastSeen = useRef(0);

  useEffect(() => {
    if (open) {
      lastSeen.current = turns.length;
      setUnread(false);
    } else if (!busy && turns.length > lastSeen.current) {
      setUnread(true);
    }
  }, [open, busy, turns.length]);

  if (pathname === "/assistente") return null;

  return (
    <>
      {open && <ChatPanel onClose={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          open ? "Fechar a conversa com o Pila" : "Conversar com o Pila"
        }
        title={open ? "Fechar" : "Conversar com o Pila"}
        className={cx(
          "fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-40 grid size-14 place-items-center rounded-full sm:right-6 sm:bottom-6",
          "border border-card-edge bg-surface transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-surface-2",
          // No celular o painel ocupa a tela e tem o próprio "fechar"
          open && "max-sm:hidden",
        )}
      >
        {open ? (
          <X className="size-5 text-muted" />
        ) : (
          <Pila size={40} mood={busy ? "neutral" : "happy"} />
        )}
        {unread && !open && (
          <span
            className="absolute top-0.5 right-0.5 size-3 rounded-full border-2 border-surface bg-accent"
            aria-hidden
          />
        )}
      </button>
    </>
  );
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const titleId = useId();
  const inputId = useId();

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(root.current, {
        ...motion.dialogIn,
        y: 12,
        autoAlpha: 0,
        transformOrigin: "100% 100%",
      });
    },
    { scope: root },
  );

  const { contextSafe } = useGSAP({ scope: root });
  const close = contextSafe(() => {
    if (closing.current) return;
    closing.current = true;
    if (prefersReducedMotion()) return onClose();
    gsap.to(root.current, {
      ...motion.dialogOut,
      y: 8,
      autoAlpha: 0,
      onComplete: onClose,
    });
  });
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // Foco no campo ao abrir; Esc fecha e devolve o foco ao botão
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.getElementById(inputId)?.focus();
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [inputId]);

  return (
    <div
      ref={root}
      role="dialog"
      aria-labelledby={titleId}
      className={cx(
        "fixed z-40 flex flex-col gap-3 rounded-card border border-card-edge bg-surface p-4",
        // Celular: quase a tela toda, acima da barra de seções
        "inset-x-2 top-16 bottom-[calc(72px+env(safe-area-inset-bottom,0px))]",
        // Daqui para cima: painel no canto, acima do botão
        "sm:inset-auto sm:right-6 sm:bottom-24 sm:h-[min(600px,calc(100dvh-140px))] sm:w-[400px]",
      )}
    >
      <div className="flex items-center gap-2">
        <h2 id={titleId} className="flex-1 font-semibold">
          Pila
        </h2>
        <Link
          href="/assistente"
          onClick={() => close()}
          aria-label="Abrir a aba Assistente"
          title="Abrir a aba Assistente"
          className="grid size-11 place-items-center rounded-chip text-muted transition-colors duration-[var(--dur-fast)] hover:bg-surface-2 hover:text-foreground sm:size-9 [&_svg]:size-4"
        >
          <Maximize2 />
        </Link>
        <IconButton label="Fechar" onClick={() => close()}>
          <X />
        </IconButton>
      </div>
      <ChatView
        inputId={inputId}
        compact
        setup={
          <Link
            href="/assistente"
            onClick={() => close()}
            className="font-semibold text-accent underline underline-offset-2"
          >
            Configurar o assistente
          </Link>
        }
      />
    </div>
  );
}
