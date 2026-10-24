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
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AssistantProvider } from "@/components/assistant/context";
import { AssistantFab } from "@/components/assistant/fab";
import { ThemeToggle, Toaster, VaultMark } from "@/components/chrome";
import { IconButton, cx, tone } from "@/components/ui";
import { api, setToken, type Me } from "@/lib/api";

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
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!me) return null;

  function logout() {
    setToken(null);
    router.replace("/login");
  }

  return (
    <AssistantProvider>
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6">
            <Link
              href="/"
              className="mr-4 flex shrink-0 items-center gap-2.5 rounded-control font-bold"
            >
              <VaultMark />
              ManagerFinance
            </Link>
            <nav className="hidden gap-1 sm:flex" aria-label="Seções">
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
              <ThemeToggle />
              <IconButton label="Sair" onClick={logout}>
                <LogOut />
              </IconButton>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pt-6 pb-44 sm:px-6 sm:pt-8 sm:pb-28">
          {children}
        </main>

        {/* Celular: as seções viram uma barra inferior fixa */}
        <nav
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
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cx(
        "inline-flex min-h-9 items-center gap-2 rounded-control px-2.5 text-sm font-medium lg:px-3",
        "transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]",
        active
          ? "bg-[color-mix(in_oklab,var(--c)_13%,transparent)] text-foreground"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon className="size-4 text-[var(--c)]" strokeWidth={2.2} />
      {/* Entre sm e lg, 7 seções não cabem com nome: fica o ícone (o nome vai no title e no leitor de tela) */}
      <span className="sr-only lg:not-sr-only">{item.label}</span>
    </Link>
  );
}
