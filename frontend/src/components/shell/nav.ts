import {
  Gift,
  Landmark,
  LayoutDashboard,
  List,
  MessagesSquare,
  PiggyBank,
  Target,
  type LucideIcon,
} from "lucide-react";

// Seções do app (MASTER.md, "Seções do menu"). A cor é só do ícone. No celular, as `bar` ficam
// na barra de baixo, as `more` no "Mais" e o Assistente fica com o botão do Pila.
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  color: string;
  mobile: "bar" | "more" | "none";
};

export const NAV: NavItem[] = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard, color: "var(--accent)", mobile: "bar" },
  { href: "/transacoes", label: "Transações", icon: List, color: "var(--cat-home)", mobile: "bar" },
  { href: "/orcamentos", label: "Orçamentos", icon: Target, color: "var(--cat-move)", mobile: "bar" },
  { href: "/cofrinhos", label: "Cofrinhos", icon: PiggyBank, color: "var(--cat-care)", mobile: "bar" },
  { href: "/desejos", label: "Desejos", icon: Gift, color: "var(--cat-shop)", mobile: "more" },
  { href: "/contas", label: "Contas", icon: Landmark, color: "var(--cat-fun)", mobile: "more" },
  { href: "/assistente", label: "Assistente", icon: MessagesSquare, color: "var(--cat-fin)", mobile: "more" },
];
