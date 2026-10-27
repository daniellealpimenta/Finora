"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  Bike,
  BriefcaseBusiness,
  Bus,
  Car,
  CarTaxiFront,
  CircleDashed,
  CirclePlus,
  CreditCard,
  Dices,
  Dumbbell,
  Fuel,
  GraduationCap,
  HandHeart,
  House,
  Lightbulb,
  PawPrint,
  Percent,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Tag,
  Ticket,
  TrendingUp,
  Tv,
  UtensilsCrossed,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { gsap, motion, prefersReducedMotion } from "@/lib/motion";
import type { CategoryKind } from "@/lib/api";
import { IconBadge } from "./ui";

// Chave do catálogo (backend/app/services/categories.py) -> família de cor + ícone. Ver MASTER.md.
const FAMILY = {
  home: "var(--cat-home)",
  food: "var(--cat-food)",
  move: "var(--cat-move)",
  care: "var(--cat-care)",
  fun: "var(--cat-fun)",
  shop: "var(--cat-shop)",
  fin: "var(--cat-fin)",
  income: "var(--positive)",
  transfer: "var(--muted)",
};

const CATEGORY: Record<string, [keyof typeof FAMILY, LucideIcon]> = {
  housing: ["home", House],
  utilities: ["home", Lightbulb],
  telecom: ["home", Wifi],
  groceries: ["food", ShoppingCart],
  eating_out: ["food", UtensilsCrossed],
  delivery: ["food", Bike],
  transport: ["move", Bus],
  ride_hailing: ["move", CarTaxiFront],
  fuel: ["move", Fuel],
  vehicle: ["move", Car],
  travel: ["move", Plane],
  health: ["care", Stethoscope],
  pharmacy: ["care", Pill],
  fitness: ["care", Dumbbell],
  leisure: ["fun", Ticket],
  subscriptions: ["fun", Tv],
  education: ["fun", GraduationCap],
  gambling: ["fun", Dices],
  shopping: ["shop", ShoppingBag],
  pets: ["shop", PawPrint],
  donations: ["shop", HandHeart],
  taxes_fees: ["fin", Receipt],
  debt: ["fin", Percent],
  insurance: ["fin", ShieldCheck],
  transfers_out: ["fin", Send],
  other: ["fin", CircleDashed],
  salary: ["income", BriefcaseBusiness],
  extra_income: ["income", Sparkles],
  investment_income: ["income", TrendingUp],
  transfers_in: ["income", ArrowDownLeft],
  other_income: ["income", CirclePlus],
  own_transfer: ["transfer", ArrowLeftRight],
  card_payment: ["transfer", CreditCard],
  investments: ["transfer", PiggyBank],
};

const BY_KIND: Record<CategoryKind, [keyof typeof FAMILY, LucideIcon]> = {
  EXPENSE: ["fin", Tag],
  INCOME: ["income", Tag],
  TRANSFER: ["transfer", Tag],
};

/** Cor e ícone de uma categoria; categorias criadas pelo usuário caem no padrão do tipo. */
export function categoryStyle(key: string | null | undefined, kind?: CategoryKind | null) {
  const [family, icon] =
    (key && CATEGORY[key]) || (kind ? BY_KIND[kind] : (["transfer", Tag] as const));
  return { color: FAMILY[family], icon };
}

export function CategoryIcon({
  categoryKey,
  kind,
  size = "md",
  className,
}: {
  categoryKey: string | null | undefined;
  kind?: CategoryKind | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const { color, icon } = categoryStyle(categoryKey, kind);
  const wrap = useRef<HTMLSpanElement>(null);
  const shown = useRef(categoryKey);

  // Categoria trocada (pelo usuário ou por uma regra): o selo vira mostrando a troca
  useEffect(() => {
    if (shown.current === categoryKey) return;
    shown.current = categoryKey;
    if (!wrap.current || prefersReducedMotion()) return;
    gsap.fromTo(wrap.current, { rotationY: -90, scale: 0.8 }, { rotationY: 0, scale: 1, ...motion.swap });
  }, [categoryKey]);

  return (
    <span ref={wrap} className="inline-grid shrink-0">
      <IconBadge icon={icon} color={color} size={size} className={className} />
    </span>
  );
}
