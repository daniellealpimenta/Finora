"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cx } from "@/components/ui";
import { api, setToken, type Me } from "@/lib/api";

const NAV = [
  { href: "/", label: "Visão geral" },
  { href: "/transacoes", label: "Transações" },
  { href: "/orcamentos", label: "Orçamentos" },
  { href: "/contas", label: "Contas" },
];

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

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 overflow-x-auto px-4 py-3">
          <span className="shrink-0 font-semibold">ManagerFinance</span>
          <nav className="flex shrink-0 gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "rounded-md px-2.5 py-1 text-sm",
                  pathname === item.href
                    ? "bg-surface-2 font-medium"
                    : "text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            className="ml-auto shrink-0 text-sm text-muted hover:text-foreground"
            onClick={() => {
              setToken(null);
              router.replace("/login");
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
