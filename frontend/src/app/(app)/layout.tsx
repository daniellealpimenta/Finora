"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AssistantProvider } from "@/components/assistant/context";
import { AssistantFab } from "@/components/assistant/fab";
import { CoinMark, Toaster } from "@/components/chrome";
import { MascotProvider } from "@/components/pila";
import { AccountMenu } from "@/components/shell/account-menu";
import { Dock } from "@/components/shell/dock";
import { MobileNav } from "@/components/shell/mobile-nav";
import { CommandPalette } from "@/components/shell/palette";
import { openPalette } from "@/components/shell/palette-store";
import { UpdateBanner } from "@/components/update-banner";
import { api, setToken, type Me } from "@/lib/api";
import { FULL, gsap, motion, useGSAP } from "@/lib/motion";

/**
 * Casca do app (opção "Doca", 2026-11-06): nada preso no topo. As seções ficam numa doca
 * flutuante embaixo (no celular, barra flutuante com "Mais"); sincronizar, tema, som, perfil e
 * sair moram no avatar do canto; tudo isso também está no ⌘K. A linha da marca rola com a página.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // No .exe (export estático, trailingSlash) o caminho chega como "/transacoes/"
  const pathname = usePathname().replace(/(.)\/$/, "$1");
  const [me, setMe] = useState<Me | null>(null);
  const shell = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => router.replace("/login"));
  }, [router]);

  const logout = useCallback(() => {
    setToken(null);
    router.replace("/login");
  }, [router]);

  // Troca de página: o conteúdo novo aparece (os cards sobem pela entrada da página); no
  // celular, o ícone ativo dá um pulinho
  useGSAP(
    () => {
      if (!me) return;
      const q = gsap.utils.selector(shell);
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.fromTo(
          q("main"),
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: motion.page.duration, ease: motion.page.ease, clearProps: "opacity,visibility" },
        );
        gsap.fromTo(
          q('nav[data-mobile] a[aria-current="page"] [data-icon]'),
          { y: -8, scale: 1.25 },
          { y: 0, scale: 1, ...motion.spring },
        );
      });
      return () => mm.revert();
    },
    { scope: shell, dependencies: [pathname, Boolean(me)] },
  );

  if (!me) return null;

  return (
    <MascotProvider initial={me.mascot}>
    <AssistantProvider>
      <div ref={shell} className="min-h-screen">
        {/* Marca e avatar numa linha que rola com a página: não é barra, não fica presa */}
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-5 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-control font-display text-[17px] font-bold">
            <CoinMark />
            Finora
          </Link>
          <button
            type="button"
            onClick={openPalette}
            className="ml-auto hidden min-h-10 items-center gap-2.5 rounded-full border border-border bg-surface px-4 text-sm text-muted transition-colors duration-[var(--dur-fast)] hover:text-foreground sm:flex"
          >
            <Search className="size-4" aria-hidden />
            Buscar ou ir para…
            <kbd className="rounded-[5px] border border-border px-1.5 text-xs">⌘K</kbd>
          </button>
          <div className="max-sm:ml-auto">
            <AccountMenu me={me} onLogout={logout} />
          </div>
        </div>
        <UpdateBanner />

        <main className="mx-auto max-w-6xl px-4 pt-6 pb-44 sm:px-6 sm:pb-36">{children}</main>

        <Dock pathname={pathname} />
        <MobileNav pathname={pathname} />
        <CommandPalette onLogout={logout} />
        <AssistantFab />
        <Toaster />
      </div>
    </AssistantProvider>
    </MascotProvider>
  );
}
