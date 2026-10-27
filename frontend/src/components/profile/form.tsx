"use client";

import { useId, useState, type ReactNode } from "react";

import { Dialog } from "@/components/dialog";
import { Button, ErrorNote, cx, inputClass } from "@/components/ui";

/**
 * Formulário de diálogo: manda para a API e só fecha se der certo; o erro aparece no próprio
 * diálogo (senha errada, código inválido).
 */
export function FormDialog({
  title,
  submit,
  onSubmit,
  onClose,
  onDone,
  children,
  destructive,
}: {
  title: string;
  submit: string;
  onSubmit: () => Promise<unknown> | string;
  onClose: () => void;
  onDone: () => void;
  children: ReactNode;
  destructive?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={title} onClose={onClose}>
      {(close) => (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              const result = onSubmit();
              if (typeof result === "string") return setError(result);
              await result;
              close(() => {
                onClose();
                onDone();
              });
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {children}
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => close()}>
              Cancelar
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "primary"} disabled={busy}>
              {submit}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} required {...input} className={cx(inputClass, "w-full", input.className)} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
