import type { ButtonHTMLAttributes, ReactNode } from "react";

import { monthLabel, shiftMonth } from "@/lib/format";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-border bg-surface p-4", className)}>
      {children}
    </section>
  );
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-medium">{children}</h2>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  const styles = {
    primary: "bg-accent text-accent-fg hover:opacity-90",
    secondary: "border border-border bg-surface hover:bg-surface-2",
    ghost: "hover:bg-surface-2",
    danger: "border border-border text-negative hover:bg-surface-2",
  }[variant];
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
    />
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-surface">
      <button
        aria-label="Mês anterior"
        className="px-2.5 py-1.5 text-muted hover:text-foreground"
        onClick={() => onChange(shiftMonth(value, -1))}
      >
        ‹
      </button>
      <span className="min-w-36 text-center text-sm font-medium">{monthLabel(value)}</span>
      <button
        aria-label="Próximo mês"
        className="px-2.5 py-1.5 text-muted hover:text-foreground"
        onClick={() => onChange(shiftMonth(value, 1))}
      >
        ›
      </button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-negative">
      {children}
    </p>
  );
}

export const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent";
