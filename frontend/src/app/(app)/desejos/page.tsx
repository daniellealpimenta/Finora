"use client";

import {
  Check,
  ExternalLink,
  FolderPlus,
  Gift,
  Link2,
  Pencil,
  PiggyBank,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { HealthCheck } from "@/components/dashboard/types";
import { INFO_WISH_FIT } from "@/components/dashboard/info";
import { Dialog } from "@/components/dialog";
import { InfoTip } from "@/components/info-tip";
import { PilaSays } from "@/components/pila";
import {
  Button,
  Card,
  ErrorNote,
  IconBadge,
  IconButton,
  Meter,
  PageHeader,
  Pill,
  STATUS_COLOR,
  StatusShape,
  cx,
  inputClass,
  tone,
  type Status,
} from "@/components/ui";
import {
  api,
  type ProductPreview,
  type SavingsPot,
  type WishGroup,
  type WishItem,
  type Wishlist,
} from "@/lib/api";
import { money, parseMoney } from "@/lib/format";
import { usePageEnter } from "@/lib/motion";
import { notify } from "@/lib/signals";

const WISH_COLOR = "var(--cat-shop)";
const PRIORITY_LABEL: Record<WishItem["priority"], string> = { 1: "Alta", 2: "Média", 3: "Baixa" };

/** GET /wishlist/affordability (backend/app/services/affordability.py): a mesma avaliação que o
 * Pila usa. Considera a sobra no seu ritmo, a saúde financeira, parcelamento e juntar. */
type Evaluation = {
  preco: number;
  veredito: "cabe" | "aperta" | "nao_cabe";
  titulo: string;
  motivo: string;
  recomendacao: string | null;
  parcelamento: { parcelas: number; valor_parcela: number; acima_do_ideal: boolean } | null;
  juntar: { por_ciclo: number; ciclos: number } | null;
};
type Affordability = {
  health: HealthCheck;
  items: Record<string, Evaluation>;
  /** Na ordem da lista (prioridade): os que cabem juntos sem apertar */
  together: { itens: string[]; total: number; sobra_depois: number };
};
const VERDICT_STATUS: Record<Evaluation["veredito"], Status> = { cabe: "ok", aperta: "warn", nao_cabe: "bad" };

export default function DesejosPage() {
  const [data, setData] = useState<Wishlist | null>(null);
  const [pots, setPots] = useState<SavingsPot[]>([]);
  const [afford, setAfford] = useState<Affordability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WishItem | "new" | null>(null);
  const [groupDialog, setGroupDialog] = useState<WishGroup | "new" | null>(null);
  const [removing, setRemoving] = useState<{ kind: "item"; item: WishItem } | { kind: "group"; group: WishGroup } | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);

  usePageEnter(root, data !== null);

  const load = useCallback(async () => {
    const [w, p] = await Promise.all([api<Wishlist>("/wishlist"), api<SavingsPot[]>("/pots")]);
    setData(w);
    setPots(p);
    // Preço mudou ou item novo: reavalia. Sem contas conectadas não há previsão e os selos só somem
    api<Affordability>("/wishlist/affordability")
      .then(setAfford)
      .catch(() => setAfford(null));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function run(action: () => Promise<unknown>, message?: string) {
    try {
      await action();
      setError(null);
      await load();
      if (message) notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const patchItem = (item: WishItem, body: Record<string, unknown>, message: string) =>
    run(() => api(`/wishlist/items/${item.id}`, { method: "PATCH", body: JSON.stringify(body) }), message);

  async function refresh(item: WishItem) {
    setRefreshing(item.id);
    try {
      const updated = await api<WishItem>(`/wishlist/items/${item.id}/refresh`, { method: "POST" });
      await load();
      const before = Number(item.price);
      const now = Number(updated.price);
      notify(
        now < before
          ? `${item.name} baixou para ${money(now)}.`
          : now > before
            ? `${item.name} subiu para ${money(now)}.`
            : `${item.name}: mesmo preço.`,
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "bad");
    } finally {
      setRefreshing(null);
    }
  }

  const items = data?.items ?? [];
  const groups = data?.groups ?? [];
  const wanted = items.filter((i) => i.status === "WANTED");
  const done = items.filter((i) => i.status !== "WANTED");
  const loose = wanted.filter((i) => i.group_id === null);
  const fitting = afford ? wanted.filter((i) => afford.items[i.id]?.veredito === "cabe").length : null;
  // Cada um cabe sozinho, mas não necessariamente todos juntos
  const together = afford ? afford.together.itens.length : null;

  const rowProps = {
    afford,
    refreshing,
    onRefresh: refresh,
    onEdit: (item: WishItem) => setEditing(item),
    onBought: (item: WishItem) => patchItem(item, { status: "BOUGHT" }, `${item.name} marcado como comprado.`),
    onRemove: (item: WishItem) => setRemoving({ kind: "item", item }),
  };

  return (
    <div ref={root}>
      <PageHeader
        title="Desejos"
        description="O que você quer comprar, com o preço de hoje. Cole o link e eu busco nome, preço e foto; uma vez por dia confiro se o preço mudou."
        actions={
          <>
            <Button onClick={() => setGroupDialog("new")}>
              <FolderPlus />
              Novo grupo
            </Button>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus />
              Adicionar desejo
            </Button>
          </>
        }
      />

      <div className="grid gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {data && items.length === 0 && (
          <Card data-enter className="grid justify-items-center gap-4 py-10 text-center">
            <PilaSays mood="happy" size={110}>
              Nada na lista ainda. Cole o link de algo que você quer e eu acompanho o preço.
            </PilaSays>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus />
              Adicionar o primeiro
            </Button>
          </Card>
        )}

        {data && items.length > 0 && (
          <Card data-enter className="grid gap-2">
            <p className="label flex items-center gap-1">
              Total desejado
              <InfoTip label="Como o app avalia cada desejo">{INFO_WISH_FIT}</InfoTip>
            </p>
            <p className="text-[40px] leading-none font-display font-normal tracking-[-0.03em] tabular">
              <span className="text-accent">R$</span>{" "}
              {Number(data.total).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted">
              {data.count} {data.count === 1 ? "desejo" : "desejos"}
              {groups.length > 0 && ` em ${groups.length} ${groups.length === 1 ? "grupo" : "grupos"}`}
              {fitting !== null && together !== null && (
                <>
                  ;{" "}
                  {fitting === 0 ? (
                    "nenhum cabe neste ciclo sem apertar o dia a dia ou a meta de guardar"
                  ) : together >= fitting ? (
                    <>
                      <strong className="font-semibold text-positive">{fitting}</strong>{" "}
                      {fitting === 1 ? "cabe" : "cabem juntos"} neste ciclo sem apertar o dia a dia nem a meta de guardar
                    </>
                  ) : (
                    <>
                      <strong className="font-semibold text-positive">{fitting}</strong> cabem um de cada vez; juntos, só{" "}
                      {together === 0 ? "nenhum" : together === 1 ? "o primeiro" : `os ${together} primeiros`} da lista (
                      {money(afford!.together.total)}) sem apertar
                    </>
                  )}
                </>
              )}
              .
              {Number(data.bought_total) > 0 && <> Já comprou {money(data.bought_total)} da lista.</>}
            </p>
            {/* Saúde financeira vem antes do desejo (mesmas frases que o Pila usa) */}
            {afford && afford.health.tips.length > 0 && (
              <p
                style={tone(STATUS_COLOR[afford.health.status])}
                className="tint flex items-start gap-2 rounded-control px-3 py-2.5 text-sm leading-relaxed"
              >
                <StatusShape status={afford.health.status} className="mt-1" />
                <span>{afford.health.tips[0]}</span>
              </p>
            )}
          </Card>
        )}

        {groups.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            onEdit={() => setGroupDialog(g)}
            onRemove={() => setRemoving({ kind: "group", group: g })}
          >
            <ItemList items={wanted.filter((i) => i.group_id === g.id)} {...rowProps} />
          </GroupCard>
        ))}

        {loose.length > 0 && (
          <Card data-enter className="grid gap-3">
            <div className="flex items-center gap-3">
              <IconBadge icon={Gift} color="var(--muted)" />
              <h2 className="min-w-0 flex-1 font-semibold">{groups.length > 0 ? "Sem grupo" : "Lista"}</h2>
              <p className="text-lg font-display font-normal tabular">{money(data?.ungrouped_total)}</p>
            </div>
            <ItemList items={loose} {...rowProps} />
          </Card>
        )}

        {done.length > 0 && (
          <Card data-enter>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Já comprei ou desisti <span className="font-normal text-muted">({done.length})</span>
              </summary>
              <ul className="mt-3 divide-y divide-border">
                {done.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className={cx("font-medium", i.status === "DROPPED" && "text-muted line-through")}>{i.name}</p>
                      <p className="text-xs text-muted">
                        {i.status === "BOUGHT"
                          ? `Comprado${i.bought_at ? ` em ${new Date(`${i.bought_at}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}`
                          : "Desisti"}
                      </p>
                    </div>
                    <p className="tabular">{money(i.price)}</p>
                    <IconButton
                      label="Voltar para a lista"
                      onClick={() => patchItem(i, { status: "WANTED" }, `${i.name} voltou para a lista.`)}
                    >
                      <Undo2 />
                    </IconButton>
                    <IconButton label="Apagar" onClick={() => setRemoving({ kind: "item", item: i })}>
                      <Trash2 />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        )}
      </div>

      {editing && (
        <ItemDialog
          item={editing === "new" ? null : editing}
          groups={groups}
          onClose={() => setEditing(null)}
          onSave={(body, id) =>
            run(
              () =>
                id === null
                  ? api("/wishlist/items", { method: "POST", body: JSON.stringify(body) })
                  : api(`/wishlist/items/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
              id === null ? `${body.name} adicionado.` : "Desejo salvo.",
            )
          }
          onDrop={(item) => patchItem(item, { status: "DROPPED" }, `${item.name} saiu da soma.`)}
        />
      )}

      {groupDialog && (
        <GroupDialog
          group={groupDialog === "new" ? null : groupDialog}
          pots={pots}
          onClose={() => setGroupDialog(null)}
          onSave={(body, id) =>
            run(
              () =>
                id === null
                  ? api("/wishlist/groups", { method: "POST", body: JSON.stringify(body) })
                  : api(`/wishlist/groups/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
              id === null ? `Grupo ${body.name} criado.` : "Grupo salvo.",
            )
          }
        />
      )}

      {removing && (
        <Dialog
          title={`Apagar ${removing.kind === "item" ? removing.item.name : removing.group.name}?`}
          onClose={() => setRemoving(null)}
        >
          {(close) => (
            <div className="grid gap-5">
              <p className="text-sm text-muted">
                {removing.kind === "item"
                  ? "O desejo e o histórico de preço dele somem. Se você só desistiu, prefira “Desisti” na edição: ele sai da soma e fica guardado."
                  : "Só o grupo some. Os desejos dele continuam na lista, sem grupo."}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => close()}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const target = removing;
                    close(() => {
                      setRemoving(null);
                      run(
                        () =>
                          api(
                            target.kind === "item"
                              ? `/wishlist/items/${target.item.id}`
                              : `/wishlist/groups/${target.group.id}`,
                            { method: "DELETE" },
                          ),
                        target.kind === "item" ? `${target.item.name} apagado.` : `Grupo ${target.group.name} apagado.`,
                      );
                    });
                  }}
                >
                  <Trash2 />
                  Apagar
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

function GroupCard({
  group,
  children,
  onEdit,
  onRemove,
}: {
  group: WishGroup;
  children: ReactNode;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const total = Number(group.total);
  const saved = group.pot_balance === null ? null : Number(group.pot_balance);
  return (
    <Card data-enter className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <IconBadge icon={ShoppingBag} color={WISH_COLOR} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{group.name}</h2>
          <p className="text-xs text-muted">
            {group.count} {group.count === 1 ? "desejo" : "desejos"}
          </p>
        </div>
        <p className="text-lg font-display font-normal tabular">{money(total)}</p>
        <div className="flex">
          <IconButton label={`Editar ${group.name}`} onClick={onEdit}>
            <Pencil />
          </IconButton>
          <IconButton label={`Apagar ${group.name}`} onClick={onRemove}>
            <Trash2 />
          </IconButton>
        </div>
      </div>
      {saved !== null && (
        <div className="grid gap-1.5">
          <Meter
            value={total > 0 ? saved / total : 1}
            color={saved >= total ? "var(--positive)" : "var(--cat-care)"}
            label={`${money(saved)} guardados de ${money(total)}`}
          />
          <p className="flex items-center gap-1.5 text-xs text-muted tabular">
            <PiggyBank className="size-3.5 text-[var(--cat-care)]" aria-hidden />
            {saved >= total
              ? `${group.pot_name} já cobre o grupo (${money(saved)}).`
              : `${money(saved)} guardados em ${group.pot_name}; faltam ${money(total - saved)}.`}
          </p>
        </div>
      )}
      {children}
    </Card>
  );
}

function ItemList({
  items,
  ...rowProps
}: {
  items: WishItem[];
  afford: Affordability | null;
  refreshing: number | null;
  onRefresh: (item: WishItem) => void;
  onEdit: (item: WishItem) => void;
  onBought: (item: WishItem) => void;
  onRemove: (item: WishItem) => void;
}) {
  if (items.length === 0) return <p className="text-sm text-muted">Nenhum desejo neste grupo ainda.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} {...rowProps} />
      ))}
    </ul>
  );
}

function ItemRow({
  item,
  afford,
  refreshing,
  onRefresh,
  onEdit,
  onBought,
  onRemove,
}: {
  item: WishItem;
  afford: Affordability | null;
  refreshing: number | null;
  onRefresh: (item: WishItem) => void;
  onEdit: (item: WishItem) => void;
  onBought: (item: WishItem) => void;
  onRemove: (item: WishItem) => void;
}) {
  const price = Number(item.price);
  const first = Number(item.first_price);
  const target = item.target_price === null ? null : Number(item.target_price);
  const verdict = item.status === "WANTED" ? afford?.items[item.id] : undefined;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <Thumb item={item} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex items-center gap-1.5 font-medium">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate underline-offset-2 hover:underline"
            >
              {item.name}
            </a>
          ) : (
            <span className="truncate">{item.name}</span>
          )}
          {item.url && <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden />}
        </p>
        <p className="text-xs text-muted">
          {[item.store, `prioridade ${PRIORITY_LABEL[item.priority].toLowerCase()}`].filter(Boolean).join(" · ")}
          {item.notes && <> · {item.notes}</>}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {verdict && (
            <Pill status={VERDICT_STATUS[verdict.veredito]} title={verdict.motivo}>
              {verdict.titulo}
            </Pill>
          )}
          {target !== null && price <= target && <Pill status="ok">No preço-alvo</Pill>}
          {price < first && <Pill status="ok">Caiu {money(first - price)}</Pill>}
          {price > first && <Pill status="warn">Subiu {money(price - first)}</Pill>}
        </div>
        {/* Fora do "cabe": o motivo e o que fazer (parcelar ou juntar) */}
        {verdict && verdict.veredito !== "cabe" && (
          <p className="mt-1.5 max-w-[62ch] text-xs leading-relaxed text-muted">
            {verdict.motivo} {verdict.recomendacao}
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="font-medium tabular">{money(price)}</p>
        {price !== first && <p className="text-xs text-muted line-through tabular">{money(first)}</p>}
        {target !== null && price > target && <p className="text-xs text-muted tabular">alvo {money(target)}</p>}
      </div>
      <div className="flex">
        {item.url && (
          <IconButton
            label="Conferir preço agora"
            onClick={() => onRefresh(item)}
            disabled={refreshing === item.id}
          >
            <RefreshCw className={cx(refreshing === item.id && "motion-safe:animate-spin")} />
          </IconButton>
        )}
        <IconButton label="Comprei" onClick={() => onBought(item)}>
          <Check />
        </IconButton>
        <IconButton label="Editar" onClick={() => onEdit(item)}>
          <Pencil />
        </IconButton>
        <IconButton label="Apagar" onClick={() => onRemove(item)}>
          <Trash2 />
        </IconButton>
      </div>
    </li>
  );
}

function Thumb({ item }: { item: Pick<WishItem, "image_url" | "name"> }) {
  const [broken, setBroken] = useState(false);
  if (!item.image_url || broken)
    return (
      <span style={tone(WISH_COLOR)} className="tint grid size-12 shrink-0 place-items-center rounded-control" aria-hidden>
        <Gift className="size-5" strokeWidth={2.2} />
      </span>
    );
  return (
    // Imagens de qualquer loja: next/image exigiria liberar cada domínio
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.image_url}
      alt=""
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setBroken(true)}
      className="size-12 shrink-0 rounded-control bg-white object-contain"
    />
  );
}

type ItemBody = {
  name: string;
  price: number;
  url: string | null;
  group_id: number | null;
  store: string | null;
  image_url: string | null;
  notes: string | null;
  priority: number;
  target_price: number | null;
};

function ItemDialog({
  item,
  groups,
  onClose,
  onSave,
  onDrop,
}: {
  item: WishItem | null;
  groups: WishGroup[];
  onClose: () => void;
  onSave: (body: ItemBody, id: number | null) => Promise<void>;
  onDrop: (item: WishItem) => Promise<void>;
}) {
  const [url, setUrl] = useState(item?.url ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? Number(item.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
  const [groupId, setGroupId] = useState<string>(item?.group_id ? String(item.group_id) : "");
  const [priority, setPriority] = useState(String(item?.priority ?? 2));
  const [target, setTarget] = useState(
    item?.target_price ? Number(item.target_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
  );
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [store, setStore] = useState(item?.store ?? "");
  const [image, setImage] = useState(item?.image_url ?? "");
  const [fetching, setFetching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFetched = useRef(item?.url ?? "");

  async function lookup(link: string) {
    const clean = link.trim();
    if (!/^https?:\/\//i.test(clean) || clean === lastFetched.current) return;
    lastFetched.current = clean;
    setFetching(true);
    setNote(null);
    try {
      const p = await api<ProductPreview>("/wishlist/preview", { method: "POST", body: JSON.stringify({ url: clean }) });
      if (p.name) setName(p.name);
      if (p.price) setPrice(Number(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
      if (p.image_url) setImage(p.image_url);
      if (p.store) setStore(p.store);
      setNote(
        p.price
          ? "Achei os dados do produto. Confira antes de salvar."
          : "A loja não informou o preço na página. Preencha à mão.",
      );
    } catch (e) {
      setNote(`${e instanceof Error ? e.message : String(e)}. Preencha à mão.`);
    } finally {
      setFetching(false);
    }
  }

  return (
    <Dialog title={item ? "Editar desejo" : "Novo desejo"} onClose={onClose}>
      {(close) => (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const value = parseMoney(price);
            const targetValue = parseMoney(target);
            if (!name.trim()) return setError("Dê um nome ao desejo.");
            if (value === null || Number.isNaN(value) || value < 0)
              return setError("Preço inválido. Use só números, como 1299 ou 1.299,90.");
            if (targetValue !== null && (Number.isNaN(targetValue) || targetValue < 0))
              return setError("Preço-alvo inválido.");
            const body: ItemBody = {
              name: name.trim(),
              price: value,
              url: url.trim() || null,
              group_id: groupId ? Number(groupId) : null,
              store: store.trim() || null,
              image_url: image || null,
              notes: notes.trim() || null,
              priority: Number(priority),
              target_price: targetValue,
            };
            close(() => {
              onClose();
              onSave(body, item?.id ?? null);
            });
          }}
        >
          <div className="grid gap-1.5">
            <label htmlFor="wish-url" className="label">
              Link do produto
            </label>
            <div className="flex gap-2">
              <input
                id="wish-url"
                type="url"
                inputMode="url"
                placeholder="https://"
                className={cx(inputClass, "min-w-0 flex-1")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => lookup(url)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  setTimeout(() => lookup(pasted), 0);
                }}
              />
              <IconButton
                type="button"
                label="Buscar dados do link"
                disabled={fetching || !url.trim()}
                onClick={() => {
                  lastFetched.current = "";
                  lookup(url);
                }}
              >
                {fetching ? <RefreshCw className="motion-safe:animate-spin" /> : <Link2 />}
              </IconButton>
            </div>
            <p className="text-xs text-muted" aria-live="polite">
              {fetching ? "Lendo a página do produto…" : (note ?? "Opcional. Com link, eu busco os dados e acompanho o preço.")}
            </p>
          </div>

          <div className="flex items-start gap-3">
            {image && <Thumb item={{ image_url: image, name }} />}
            <div className="grid min-w-0 flex-1 gap-1.5">
              <label htmlFor="wish-name" className="label">
                Nome
              </label>
              <input
                id="wish-name"
                maxLength={255}
                className={cx(inputClass, "w-full")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="wish-price" className="label">
                Preço
              </label>
              <input
                id="wish-price"
                inputMode="decimal"
                placeholder="0,00"
                className={cx(inputClass, "w-full tabular")}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="wish-target" className="label">
                Preço-alvo (opcional)
              </label>
              <input
                id="wish-target"
                inputMode="decimal"
                placeholder="avise abaixo de"
                className={cx(inputClass, "w-full tabular")}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="wish-group" className="label">
                Grupo
              </label>
              <select
                id="wish-group"
                className={cx(inputClass, "w-full")}
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">Sem grupo</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="wish-priority" className="label">
                Prioridade
              </label>
              <select
                id="wish-priority"
                className={cx(inputClass, "w-full")}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {([1, 2, 3] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="wish-notes" className="label">
              Observação (opcional)
            </label>
            <input
              id="wish-notes"
              maxLength={1000}
              placeholder="cor, tamanho, esperar a Black Friday…"
              className={cx(inputClass, "w-full")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex flex-wrap justify-end gap-2">
            {item && item.status === "WANTED" && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto"
                onClick={() =>
                  close(() => {
                    onClose();
                    onDrop(item);
                  })
                }
              >
                Desisti
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => close()}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={fetching}>
              {item ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function GroupDialog({
  group,
  pots,
  onClose,
  onSave,
}: {
  group: WishGroup | null;
  pots: SavingsPot[];
  onClose: () => void;
  onSave: (body: { name: string; pot_id: number | null }, id: number | null) => Promise<void>;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [potId, setPotId] = useState(group?.pot_id ? String(group.pot_id) : "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title={group ? "Editar grupo" : "Novo grupo"} onClose={onClose}>
      {(close) => (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return setError("Dê um nome ao grupo.");
            const body = { name: name.trim(), pot_id: potId ? Number(potId) : null };
            close(() => {
              onClose();
              onSave(body, group?.id ?? null);
            });
          }}
        >
          <div className="grid gap-1.5">
            <label htmlFor="group-name" className="label">
              Nome
            </label>
            <input
              id="group-name"
              maxLength={100}
              placeholder="Casa nova, Setup, Viagem…"
              className={cx(inputClass, "w-full")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="group-pot" className="label">
              Cofrinho ligado (opcional)
            </label>
            <select
              id="group-pot"
              className={cx(inputClass, "w-full")}
              value={potId}
              onChange={(e) => setPotId(e.target.value)}
            >
              <option value="">Nenhum</option>
              {pots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({money(p.balance)})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">O saldo do cofrinho vira o progresso do grupo: quanto já está guardado.</p>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => close()}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              {group ? "Salvar" : "Criar grupo"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
