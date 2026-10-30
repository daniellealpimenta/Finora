"use client";

import {
  Gift,
  Landmark,
  LayoutDashboard,
  List,
  LogOut,
  MessagesSquare,
  PiggyBank,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AssistantProvider } from "@/components/assistant/context";
import { AssistantFab } from "@/components/assistant/fab";
import { CoinMark, SoundToggle, ThemeToggle, Toaster } from "@/components/chrome";
import { MascotProvider } from "@/components/pila";
import { IconButton, cx, tone } from "@/components/ui";
import { UpdateBanner } from "@/components/update-banner";
import { api, setToken, type Me } from "@/lib/api";
import { FULL, gsap, motion, useGSAP, wiggle } from "@/lib/motion";

// Cada seção tem a sua cor de detalhe no ícone (MASTER.md, "Seções do menu"). `mobile: false`
// fica fora da barra inferior do celular (6 itens já ocupam a largura) e vira botão no topo.
const NAV: {
  href: string;
  label: string;
  icon: LucideIcon;
  color: string;
  mobile?: false;
}[] = [
  {
    href: "/",
    label: "Visão geral",
    icon: LayoutDashboard,
    color: "var(--accent)",
  },
  {
    href: "/transacoes",
    label: "Transações",
    icon: List,
    color: "var(--cat-home)",
  },
  {
    href: "/orcamentos",
    label: "Orçamentos",
    icon: Target,
    color: "var(--cat-move)",
  },
  {
    href: "/cofrinhos",
    label: "Cofrinhos",
    icon: PiggyBank,
    color: "var(--cat-care)",
  },
  { href: "/desejos", label: "Desejos", icon: Gift, color: "var(--cat-shop)" },
  { href: "/contas", label: "Contas", icon: Landmark, color: "var(--cat-fun)" },
  {
    href: "/assistente",
    label: "Assistente",
    icon: MessagesSquare,
    color: "var(--cat-fin)",
    mobile: false,
  },
];
const ASSISTANT = NAV[NAV.length - 1];

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

  // Troca de página: o conteúdo novo sobe e assenta; a pílula do menu escorrega até a seção
  // ativa com um elástico; no celular, o ícone ativo dá um pulinho
  useGSAP(
    () => {
      if (!me) return;
      const q = gsap.utils.selector(shell);
      const pill = q("[data-nav-pill]")[0] as HTMLElement | undefined;
      const active = q('nav[data-desktop] a[aria-current="page"]')[0] as HTMLElement | undefined;
      const place = (animate: boolean) => {
        if (!pill) return;
        if (!active) return gsap.to(pill, { autoAlpha: 0, duration: 0.2 });
        // A cor vai direto: o GSAP não interpola color-mix()
        pill.style.backgroundColor = `color-mix(in oklab, ${active.dataset.color} 13%, transparent)`;
        const to = { x: active.offsetLeft, width: active.offsetWidth, autoAlpha: 1 };
        if (!animate) return gsap.set(pill, to);
        gsap
          .timeline()
          .to(pill, { ...to, duration: 0.55, ease: "elastic.out(1, 0.75)" })
          .fromTo(pill, { scaleY: 0.7 }, { scaleY: 1, duration: 0.5, ease: "elastic.out(1.2, 0.5)" }, 0);
      };
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        place(Boolean(pill?.style.width));
        gsap.fromTo(
          q("main"),
          { y: motion.page.y, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: motion.page.duration, ease: motion.page.ease, clearProps: "transform,opacity,visibility" },
        );
        gsap.fromTo(
          q('nav[data-mobile] a[aria-current="page"] [data-icon]'),
          { y: -8, scale: 1.25 },
          { y: 0, scale: 1, ...motion.spring },
        );
        gsap.fromTo("[data-brand-coin]", { rotationY: 0 }, { rotationY: 360, duration: 0.8, ease: "power3.inOut" });
      });
      mm.add("(prefers-reduced-motion: reduce)", () => place(false));
      const onResize = () => place(false);
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        mm.revert();
      };
    },
    { scope: shell, dependencies: [pathname, Boolean(me)] },
  );

  if (!me) return null;

  function logout() {
    setToken(null);
    router.replace("/login");
  }

  return (
    <MascotProvider initial={me.mascot}>
    <AssistantProvider>
      <div ref={shell} className="min-h-screen">
        {/* Barra do topo sempre grafite (theme-dark): âncora do layout e a moeda de latão brilhando nela */}
        <header className="theme-dark sticky top-0 z-30 border-b border-border bg-surface text-foreground">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6">
            <Link
              href="/"
              className="mr-4 flex shrink-0 items-center gap-2.5 rounded-control font-display text-[17px] font-bold"
            >
              <span data-brand-coin className="inline-grid">
                <CoinMark />
              </span>
              Finora
            </Link>
            <nav data-desktop className="relative hidden gap-1 sm:flex" aria-label="Seções">
              <span data-nav-pill aria-hidden className="invisible absolute top-0 left-0 h-full rounded-control" />
              {NAV.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                />
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <Link
                href={ASSISTANT.href}
                aria-label={ASSISTANT.label}
                title={ASSISTANT.label}
                style={tone(ASSISTANT.color)}
                aria-current={pathname === ASSISTANT.href ? "page" : undefined}
                className={cx(
                  "grid size-11 place-items-center rounded-chip text-[var(--c)] sm:hidden",
                  pathname === ASSISTANT.href ? "tint" : "hover:bg-surface-2",
                )}
              >
                <ASSISTANT.icon className="size-[18px]" strokeWidth={2.2} />
              </Link>
              <SoundToggle className="max-sm:hidden" />
              <ThemeToggle />
              <Link
                href="/perfil"
                aria-label="Perfil"
                title={`Perfil (${me.username ?? me.email})`}
                aria-current={pathname === "/perfil" ? "page" : undefined}
                className={cx(
                  "grid size-11 place-items-center rounded-chip transition-colors duration-[var(--dur-fast)] sm:size-9 [&_svg]:size-4",
                  pathname === "/perfil"
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <UserRound />
              </Link>
              {/* No celular não cabe: o "Sair" fica na página Perfil */}
              <IconButton label="Sair" onClick={logout} className="max-sm:hidden">
                <LogOut />
              </IconButton>
            </div>
          </div>
        </header>
        <UpdateBanner />

        <main className="mx-auto max-w-6xl px-4 pt-6 pb-44 sm:px-6 sm:pt-8 sm:pb-28">
          {children}
        </main>

        {/* Celular: as seções viram uma barra inferior fixa */}
        <nav
          data-mobile
          aria-label="Seções"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-border bg-surface px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))] sm:hidden"
        >
          {NAV.filter((item) => item.mobile !== false).map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={tone(item.color)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "grid min-h-11 min-w-0 justify-items-center gap-0.5 rounded-control py-1 text-[10.5px] font-semibold",
                  active ? "text-foreground" : "text-muted",
                )}
              >
                <span
                  data-icon
                  className={cx(
                    "grid h-7 w-11 place-items-center rounded-full text-[var(--c)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]",
                    active && "tint",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={2.2} />
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <AssistantFab />
        <Toaster />
      </div>
    </AssistantProvider>
    </MascotProvider>
  );
}

function NavLink({
  item,
  active,
}: {
  item: (typeof NAV)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      style={tone(item.color)}
      data-color={item.color}
      aria-current={active ? "page" : undefined}
      title={item.label}
      onMouseEnter={(e) => wiggle(e.currentTarget.querySelector("svg"))}
      className={cx(
        // O fundo da seção ativa é a pílula que escorrega (layout); aqui só o texto
        "relative inline-flex min-h-9 items-center gap-2 rounded-control px-2.5 text-sm font-medium whitespace-nowrap xl:px-3",
        "transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]",
        active ? "text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon className="size-4 text-[var(--c)]" strokeWidth={2.2} />
      {/* Entre sm e xl, 7 seções não cabem com nome: fica o ícone (o nome vai no title e no leitor de tela) */}
      <span className="max-xl:sr-only">{item.label}</span>
    </Link>
  );
}
