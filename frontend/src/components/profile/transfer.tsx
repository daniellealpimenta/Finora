"use client";

import { Download, FolderOpen, Laptop, MonitorSmartphone, TriangleAlert, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Dialog } from "@/components/dialog";
import { Field, FormDialog } from "@/components/profile/form";
import { Button, Card, CardTitle, ErrorNote, tone } from "@/components/ui";
import { api } from "@/lib/api";
import { notify } from "@/lib/signals";

/** Cabeçalho do arquivo `.finora` (backend: services/backup.py), lido sem a senha. */
export type BackupInfo = {
  created_at: string;
  device: string;
  system: string;
  app_version: string;
  owner: string | null;
  compatible: boolean;
  kept_as?: string | null;
};

const MIN_PASSWORD = 8;

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Escolher o arquivo, ver de onde ele veio, digitar a senha e trocar os dados. Serve no Perfil
 * (`/backup/import`, com login) e na primeira abertura (`/setup/import`, sem usuário ainda).
 */
export function ImportPanel({ endpoint, onDone }: { endpoint: string; onDone: (info: BackupInfo) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(chosen: File | undefined) {
    if (!chosen) return;
    setError(null);
    setInfo(null);
    setFile(chosen);
    const form = new FormData();
    form.append("file", chosen);
    try {
      setInfo(await api<BackupInfo>("/backup/inspect", { method: "POST", body: form }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("password", password);
    try {
      onDone(await api<BackupInfo>(endpoint, { method: "POST", body: form }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <input
        ref={input}
        type="file"
        // Sem accept: no seletor do macOS, uma extensão desconhecida (.finora) pode ficar
        // cinza e não dar para escolher. O /backup/inspect recusa o que não for backup
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <Button type="button" onClick={() => input.current?.click()} className="justify-self-start">
        <Upload />
        {file ? "Escolher outro arquivo" : "Escolher o arquivo .finora"}
      </Button>

      {info && (
        <div className="grid gap-1 rounded-control bg-surface-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 font-semibold">
            <Laptop className="size-4 text-muted" aria-hidden />
            {info.device}
            {info.system && <span className="font-normal text-muted">({info.system})</span>}
          </span>
          <span className="text-muted">
            Exportado em {when(info.created_at)}, Finora {info.app_version}
            {info.owner && `, conta de ${info.owner}`}
          </span>
        </div>
      )}

      {info && !info.compatible && (
        <ErrorNote>
          Este arquivo veio do Finora {info.app_version}, mais novo que este. Atualize o Finora neste computador e
          tente de novo.
        </ErrorNote>
      )}

      {info?.compatible && (
        <>
          <p
            style={tone("var(--warning)")}
            className="tint flex items-start gap-2 rounded-control px-3 py-2.5 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-foreground">
              Os dados deste computador serão trocados pelos do arquivo. Uma cópia do que existe hoje fica guardada na
              pasta de dados do Finora.
            </span>
          </p>
          <Field
            label="Senha do arquivo"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="A que você escolheu ao exportar."
          />
          <Button variant="primary" onClick={run} disabled={busy || password.length === 0} className="justify-self-start">
            {busy ? "Trazendo os dados…" : "Trocar pelos dados do arquivo"}
          </Button>
        </>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

/**
 * Perfil: levar os dados para outro computador. O Finora não tem nuvem, então a troca é por um
 * arquivo `.finora` criptografado com uma senha, que pode ir por pendrive, e-mail ou uma pasta
 * do iCloud Drive, Google Drive ou OneDrive.
 */
export function TransferCard({ onImported }: { onImported: (info: BackupInfo) => void }) {
  const [open, setOpen] = useState<"export" | "import" | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState<{ filename: string; folder: string } | null>(null);

  return (
    <Card data-enter id="outro-computador" className="scroll-mt-6 lg:col-span-2">
      <CardTitle icon={MonitorSmartphone} color="var(--cat-move)" hint="Mac e Windows">
        Usar em outro computador
      </CardTitle>
      <div className="grid gap-4">
        <p className="max-w-prose text-sm text-muted">
          Seus dados ficam só neste computador. Para ter as mesmas transações, categorias, cofrinhos, desejos, painel
          e configurações em outro, exporte um arquivo aqui e importe lá. Ele vai protegido por uma senha sua e pode
          ir por pendrive ou por uma pasta do iCloud Drive, Google Drive ou OneDrive.
        </p>
        <p className="max-w-prose text-xs text-muted">
          Quem importa por último vence: antes de mexer no outro computador, traga o arquivo mais recente.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setOpen("export")}>
            <Download />
            Exportar dados
          </Button>
          <Button onClick={() => setOpen("import")}>
            <Upload />
            Importar dados
          </Button>
        </div>
        {saved && (
          <div className="flex flex-wrap items-center gap-3 rounded-control bg-surface-2 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              Salvo em <b className="break-all">{saved.folder}</b> como <b className="break-all">{saved.filename}</b>
            </span>
            <Button
              variant="ghost"
              onClick={() =>
                api("/backup/reveal", { method: "POST", body: JSON.stringify({ filename: saved.filename }) }).catch((e) =>
                  notify(e.message, "bad"),
                )
              }
            >
              <FolderOpen />
              Mostrar na pasta
            </Button>
          </div>
        )}
      </div>

      {open === "export" && (
        <FormDialog
          title="Exportar dados"
          submit="Exportar"
          onClose={() => {
            setOpen(null);
            setPassword("");
            setConfirm("");
          }}
          onDone={() => notify("Arquivo pronto na pasta Downloads.", "ok", { mood: "happy" })}
          onSubmit={() => {
            if (password.length < MIN_PASSWORD) return `Use uma senha com pelo menos ${MIN_PASSWORD} caracteres`;
            if (password !== confirm) return "As duas senhas não são iguais";
            return api<{ filename: string; folder: string }>("/backup/export", {
              method: "POST",
              body: JSON.stringify({ password }),
            }).then(setSaved);
          }}
        >
          <p className="text-sm text-muted">
            O arquivo leva tudo deste computador, inclusive as chaves da Pluggy, e fica criptografado com esta senha.
            Sem ela, ninguém abre, nem você: guarde bem.
          </p>
          <Field label="Senha do arquivo" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={MIN_PASSWORD} />
          <Field label="Repita a senha" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={MIN_PASSWORD} />
        </FormDialog>
      )}

      {open === "import" && (
        <Dialog title="Importar dados" onClose={() => setOpen(null)}>
          {(close) => (
            <ImportPanel
              endpoint="/backup/import"
              onDone={(info) => close(() => {
                setOpen(null);
                onImported(info);
              })}
            />
          )}
        </Dialog>
      )}
    </Card>
  );
}
