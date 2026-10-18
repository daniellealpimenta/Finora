import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

import { monthLabel, shiftMonth } from "@/lib/format";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Define a cor de detalhe (--c) usada por .tint e pelos filhos. */
export const tone = (color: string) => ({ "--c": color }) as CSSProperties;

export function Card({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest} className={cx("rounded-card border border-card-edge bg-surface p-5 sm:p-6", className)}>
      {children}
    </section>
  );
}

export function CardTitle({
  children,
  hint,
  icon,
  color,
}: {
  children: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  color?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex items-center gap-2.5">
        {icon && <IconBadge icon={icon} color={color ?? "var(--accent)"} size="sm" />}
        <h2 className="text-[15px] font-semibold">{children}</h2>
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "destructive";
};

const BUTTON_STYLES = {
  primary:
    "bg-accent text-accent-fg hover:bg-[color-mix(in_oklab,var(--accent)_88%,var(--foreground))] active:bg-[color-mix(in_oklab,var(--accent)_78%,var(--foreground))]",
  secondary:
    "bg-surface-2 text-foreground hover:bg-[color-mix(in_oklab,var(--surface-2)_85%,var(--foreground))] active:bg-[color-mix(in_oklab,var(--surface-2)_75%,var(--foreground))]",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground active:bg-[color-mix(in_oklab,var(--surface-2)_85%,var(--foreground))]",
  danger: "text-negative hover:bg-surface-2 active:bg-[color-mix(in_oklab,var(--surface-2)_85%,var(--foreground))]",
  destructive:
    "bg-negative text-surface hover:bg-[color-mix(in_oklab,var(--negative)_88%,var(--foreground))] active:bg-[color-mix(in_oklab,var(--negative)_78%,var(--foreground))]",
};

export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold whitespace-nowrap",
        "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        BUTTON_STYLES[variant],
        className,
      )}
    />
  );
}

export function IconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={cx(
        "grid size-11 place-items-center rounded-chip text-muted sm:size-9",
        "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        "hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45",
        "[&_svg]:size-4",
        className,
      )}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="max-w-prose text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-control bg-surface p-1">
      <IconButton label="Mês anterior" onClick={() => onChange(shiftMonth(value, -1))}>
        <ChevronLeft />
      </IconButton>
      <span className="min-w-36 text-center text-sm font-semibold tabular" aria-live="polite">
        {monthLabel(value)}
      </span>
      <IconButton label="Próximo mês" onClick={() => onChange(shiftMonth(value, 1))}>
        <ChevronRight />
      </IconButton>
    </div>
  );
}

export function IconBadge({
  icon: Icon,
  color,
  size = "md",
  className,
}: {
  icon: LucideIcon;
  color: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      style={tone(color)}
      className={cx(
        "tint grid shrink-0 place-items-center rounded-chip",
        size === "sm" ? "size-[26px] [&_svg]:size-3.5" : "size-9 [&_svg]:size-[18px]",
        className,
      )}
      aria-hidden
    >
      <Icon strokeWidth={2.2} />
    </span>
  );
}

export type Status = "ok" | "warn" | "bad";

export const STATUS_COLOR: Record<Status, string> = {
  ok: "var(--positive)",
  warn: "var(--warning)",
  bad: "var(--negative)",
};

/** Forma + cor: o status nunca depende só da cor. */
export function StatusShape({ status, className }: { status: Status; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={cx("size-3 shrink-0", className)} aria-hidden>
      {status === "ok" && <circle cx="6" cy="6" r="5" fill="currentColor" />}
      {status === "warn" && <path d="M6 1 11 11H1z" fill="currentColor" />}
      {status === "bad" && <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="currentColor" />}
    </svg>
  );
}

export function Pill({
  status,
  children,
  className,
  ...rest
}: { status: Status; children: ReactNode; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      style={tone(STATUS_COLOR[status])}
      className={cx(
        "tint relative inline-flex items-center gap-1.5 overflow-hidden rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        className,
      )}
    >
      <StatusShape status={status} />
      {children}
    </span>
  );
}

/** Barra de progresso: trilha + preenchimento por scaleX (animável pelo GSAP via [data-fill]). */
export function Meter({
  value,
  color,
  thin,
  marker,
  label,
}: {
  value: number;
  color: string;
  thin?: boolean;
  marker?: number;
  label?: string;
}) {
  const v = Math.min(Math.max(value, 0), 1);
  return (
    <div
      className={cx("relative rounded-full bg-surface-2", thin ? "h-1.5" : "h-2")}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <i
          data-fill
          className="absolute inset-0 block origin-left rounded-full"
          style={{ background: color, transform: `scaleX(${v})` }}
        />
      </div>
      {marker !== undefined && (
        <span
          className="absolute -top-[3px] h-[calc(100%+6px)] w-0.5 rounded-full bg-foreground/55"
          style={{ left: `calc(${Math.min(Math.max(marker, 0), 1) * 100}% - 1px)` }}
          aria-hidden
        />
      )}
    </div>
  );
}

export function Empty({
  children,
  icon: Icon,
  color = "var(--muted)",
}: {
  children: ReactNode;
  icon?: LucideIcon;
  color?: string;
}) {
  return (
    <div className="grid justify-items-center gap-3 py-10 text-center">
      {Icon && <IconBadge icon={Icon} color={color} />}
      <p className="max-w-sm text-sm text-muted">{children}</p>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      style={tone("var(--negative)")}
      className="tint flex items-start gap-2 rounded-control px-3 py-2.5 text-sm font-medium"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export const inputClass = cx(
  "min-h-10 rounded-control border border-border bg-surface px-3 text-sm text-foreground outline-none",
  "transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
  "placeholder:text-muted hover:border-[color-mix(in_oklab,var(--border)_60%,var(--foreground))]",
  "focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_25%,transparent)] focus-visible:outline-none",
);
