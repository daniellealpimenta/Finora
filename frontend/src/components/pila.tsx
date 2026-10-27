"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { FULL, gsap, useGSAP } from "@/lib/motion";
import { cx } from "./ui";

/**
 * O mascote (MASTER.md, "Mascote"): Pila, o porquinho, por padrão; Casco, o tatu, ou Guará, o
 * lobo-guará, se o usuário trocar no Perfil. De frente, formas chapadas e sem contorno, para a
 * expressão ler bem até em 28px. Todos dividem a mesma grade (viewBox 120) e o mesmo sistema de
 * olhos e boca, então os humores valem para qualquer um. Aparece só quando há algo a dizer:
 * login, estado vazio, conquista, sincronização e erro. Nunca em todo card.
 */
export type PilaMood = "happy" | "neutral" | "worried" | "sleep" | "shy" | "celebrate";
export type MascotId = "pila" | "casco" | "guara";

export const MASCOTS: Record<MascotId, { name: string; animal: string; about: string }> = {
  pila: { name: "Pila", animal: "porquinho", about: "O cofrinho de sempre: guarda moeda por moeda." },
  casco: {
    name: "Casco",
    animal: "tatu",
    about: "Fecha-se na carapaça e guarda tudo na toca, como o app guarda seus dados no seu computador.",
  },
  guara: {
    name: "Guará",
    animal: "lobo-guará",
    about: "Discreto, brasileiro e o bicho da nota de R$ 200.",
  },
};

const STORAGE_KEY = "mf_mascot";

const isMascot = (v: unknown): v is MascotId => typeof v === "string" && v in MASCOTS;

function stored(): MascotId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isMascot(v) ? v : "pila";
  } catch {
    return "pila";
  }
}

type MascotCtx = { id: MascotId; name: string; setMascot: (id: MascotId) => void };
const Ctx = createContext<MascotCtx | null>(null);

/**
 * Mascote escolhido, para o app inteiro. Vem do backend (/auth/me); a cópia no localStorage
 * só serve para o login, que abre antes de saber quem é o usuário.
 */
export function MascotProvider({ initial, children }: { initial: string; children: ReactNode }) {
  const [id, setId] = useState<MascotId>(isMascot(initial) ? initial : "pila");
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage indisponível */
    }
  }, [id]);
  return <Ctx.Provider value={{ id, name: MASCOTS[id].name, setMascot: setId }}>{children}</Ctx.Provider>;
}

export function useMascot(): MascotCtx {
  const ctx = useContext(Ctx);
  // Fora do app (login): o último escolhido neste navegador
  const [fallback, setFallback] = useState<MascotId>("pila");
  useEffect(() => {
    if (!ctx) setFallback(stored());
  }, [ctx]);
  return ctx ?? { id: fallback, name: MASCOTS[fallback].name, setMascot: () => {} };
}

// --- rosto: olhos e boca de todos ---------------------------------------------------

/** Onde ficam olhos e boca de cada mascote, e as cores da expressão. */
type Face = {
  lx: number;
  rx: number;
  ey: number;
  mx: number;
  my: number;
  ink: string;
  tongue: string;
  /** Onde ficam o "Zz" (dormindo) e a gota (preocupado), fora das orelhas */
  zz: [number, number];
  drop: [number, number];
};

const FACES: Record<MascotId, Face> = {
  pila: { lx: 43, rx: 77, ey: 56, mx: 60, my: 89, ink: "var(--pila-ink)", tongue: "var(--pila-blush)", zz: [92, 20], drop: [95, 36] },
  casco: { lx: 43, rx: 77, ey: 58, mx: 60, my: 88, ink: "#2a1f16", tongue: "#e0866c", zz: [100, 0], drop: [101, 50] },
  guara: { lx: 44, rx: 76, ey: 52, mx: 60, my: 81, ink: "#24160d", tongue: "#e3664a", zz: [96, 14], drop: [101, 40] },
};

function Eyes({ mood, f }: { mood: PilaMood; f: Face }) {
  const { lx, rx, ey, ink } = f;
  switch (mood) {
    case "happy":
    case "celebrate":
      return (
        <path
          d={`M${lx - 6} ${ey + 2}q6-8 12 0M${rx - 6} ${ey + 2}q6-8 12 0`}
          stroke={ink}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      );
    case "sleep":
    case "shy":
      return (
        <path
          d={`M${lx - 6} ${ey}q6 6 12 0M${rx - 6} ${ey}q6 6 12 0`}
          stroke={ink}
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
      );
    default: {
      const r = mood === "worried" ? 4.6 : 5.6;
      return (
        <>
          {mood === "worried" && (
            <path
              d={`M${lx - 8} ${ey - 12}l12 4M${rx + 8} ${ey - 12}l-12 4`}
              stroke={ink}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          )}
          {/* data-eyes pisca; data-pupils segue o ponteiro (só com `alive`) */}
          <g data-eyes>
            <g data-pupils>
              {[lx, rx].map((x) => (
                <g key={x}>
                  <ellipse cx={x} cy={ey} rx={r} ry={r + 1.2} fill={ink} />
                  <circle cx={x + 2} cy={ey - 2.5} r="1.9" fill="#fff" />
                </g>
              ))}
            </g>
          </g>
        </>
      );
    }
  }
}

function Mouth({ mood, f }: { mood: PilaMood; f: Face }) {
  const { mx, my, ink, tongue, zz, drop } = f;
  switch (mood) {
    case "happy":
      return (
        <>
          <path d={`M${mx - 12} ${my}q12 14 24 0z`} fill={ink} />
          <path d={`M${mx - 7} ${my + 4}q7 5 14 0q-7-3-14 0z`} fill={tongue} />
        </>
      );
    case "celebrate":
      return (
        <>
          <path d={`M${mx - 15} ${my - 2}q15 20 30 0z`} fill={ink} />
          <path d={`M${mx - 9} ${my + 5}q9 6 18 0q-9-4-18 0z`} fill={tongue} />
          <path d="M14 30l3-7l3 7l7 3l-7 3l-3 7l-3-7l-7-3zM100 12l2-5l2 5l5 2l-5 2l-2 5l-2-5l-5-2z" fill="var(--coin)" />
        </>
      );
    case "worried":
      return (
        <>
          <path d={`M${mx - 10} ${my + 4}q5-5 10 0t10 0`} stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d={`M${drop[0]} ${drop[1]}q-5 8 0 11q5-3 0-11z`} fill="var(--cat-home)" />
        </>
      );
    case "sleep":
      return (
        <>
          <ellipse cx={mx} cy={my + 3} rx="3.5" ry="3" fill={ink} />
          <path d={`M${zz[0]} ${zz[1]}h9l-9 10h9`} stroke="var(--muted)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case "shy":
      return <path d={`M${mx - 7} ${my + 1}q7 5 14 0`} stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
    default:
      return <path d={`M${mx - 10} ${my}q10 8 20 0`} stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  }
}

// --- corpos ---------------------------------------------------------------------------
// Cores de ilustração, iguais nos dois temas. As do Pila são tokens (--pila-*); as dos outros
// ficam aqui, junto do desenho, em MASTER.md ("Mascote").

function PilaBody({ mood, f }: { mood: PilaMood; f: Face }) {
  const blush = mood === "shy" ? 0.9 : 0.5;
  return (
    <>
      <rect x="34" y="90" width="17" height="19" rx="7" fill="var(--pila-ear)" />
      <rect x="69" y="90" width="17" height="19" rx="7" fill="var(--pila-ear)" />
      <path d="M26 42Q19 26 25 19Q31 14 52 30z" fill="var(--pila-ear)" />
      <path d="M94 42Q101 26 95 19Q89 14 68 30z" fill="var(--pila-ear)" />
      <ellipse cx="60" cy="63" rx="42" ry="39" fill="var(--pila-body)" />
      <ellipse cx="44" cy="40" rx="15" ry="8" fill="var(--pila-light)" opacity="0.55" transform="rotate(-18 44 40)" />
      <rect x="49" y="27" width="22" height="5" rx="2.5" fill="var(--pila-line)" />
      <ellipse cx="30" cy="74" rx="7" ry="4.5" fill="var(--pila-blush)" opacity={blush} />
      <ellipse cx="90" cy="74" rx="7" ry="4.5" fill="var(--pila-blush)" opacity={blush} />
      <Eyes mood={mood} f={f} />
      <ellipse cx="60" cy="73" rx="15" ry="11" fill="var(--pila-light)" />
      <ellipse cx="54.5" cy="73" rx="2.6" ry="3.8" fill="var(--pila-line)" />
      <ellipse cx="65.5" cy="73" rx="2.6" ry="3.8" fill="var(--pila-line)" />
      <Mouth mood={mood} f={f} />
    </>
  );
}

/** Tatu à moda do Fuleco: casco de faixas por cima da cabeça, orelhas pontudas saindo dele,
 * focinho comprido entre os olhos com o nariz na ponta, e uma boca só, embaixo. */
function CascoBody({ mood, f, clip }: { mood: PilaMood; f: Face; clip: string }) {
  const blush = mood === "shy" ? 0.9 : mood === "worried" ? 0.25 : 0.55;
  const helmet = "M22 56Q20 16 60 14Q100 16 98 56Q82 44 60 44Q38 44 22 56z";
  return (
    <>
      <rect x="34" y="92" width="17" height="17" rx="7" fill="#6b5b4a" />
      <rect x="69" y="92" width="17" height="17" rx="7" fill="#6b5b4a" />
      <ellipse cx="60" cy="70" rx="45" ry="36" fill="#7d6c59" />
      <path d="M25 46Q8 30 12 14Q28 18 36 36z" fill="#c4a37f" />
      <path d="M26 41Q15 30 16 20Q26 24 31 35z" fill="#e7b39c" />
      <path d="M95 46Q112 30 108 14Q92 18 84 36z" fill="#c4a37f" />
      <path d="M94 41Q105 30 104 20Q94 24 89 35z" fill="#e7b39c" />
      <path d="M26 64Q26 40 60 40Q94 40 94 64Q94 92 72 100Q60 104 48 100Q26 92 26 64z" fill="#e2c9a4" />
      <clipPath id={clip}>
        <path d={helmet} />
      </clipPath>
      <path d={helmet} fill="#8b7a66" />
      <g clipPath={`url(#${clip})`} fill="none" stroke="#a5937c" strokeWidth="5">
        <path d="M12 32Q60 4 108 32" />
        <path d="M12 46Q60 18 108 46" />
      </g>
      <ellipse cx="44" cy="24" rx="11" ry="4" transform="rotate(-16 44 24)" fill="#b8a387" opacity="0.7" />
      <ellipse cx="34" cy="78" rx="6" ry="4" fill="#e0866c" opacity={blush} />
      <ellipse cx="86" cy="78" rx="6" ry="4" fill="#e0866c" opacity={blush} />
      <path d="M52 50Q52 46 60 46Q68 46 68 50L70 74Q70 82 60 82Q50 82 50 74z" fill="#f0dcc0" />
      <Eyes mood={mood} f={f} />
      <ellipse cx="60" cy="77" rx="6.5" ry="4.5" fill="#2a1f16" />
      <ellipse cx="58" cy="75.5" rx="2" ry="1.2" fill="#fff" opacity="0.5" />
      <Mouth mood={mood} f={f} />
    </>
  );
}

/** Lobo-guará: orelhas grandes, pelagem ruiva, focinho claro e a "capa" escura no pescoço e
 * nas patas. */
function GuaraBody({ mood, f }: { mood: PilaMood; f: Face }) {
  const blush = mood === "shy" ? 0.9 : mood === "worried" ? 0.25 : 0.5;
  return (
    <>
      <rect x="36" y="92" width="15" height="17" rx="6" fill="#2b2420" />
      <rect x="69" y="92" width="15" height="17" rx="6" fill="#2b2420" />
      <ellipse cx="60" cy="88" rx="31" ry="15" fill="#2b2420" />
      <path d="M22 54Q15 22 30 4Q46 18 53 34z" fill="#d9772f" />
      <path d="M28 45Q25 26 32 14Q41 24 46 35z" fill="#f6dcb8" />
      <path d="M98 54Q105 22 90 4Q74 18 67 34z" fill="#d9772f" />
      <path d="M92 45Q95 26 88 14Q79 24 74 35z" fill="#f6dcb8" />
      <ellipse cx="60" cy="60" rx="38" ry="32" fill="#d9772f" />
      <ellipse cx="45" cy="40" rx="12" ry="6" transform="rotate(-18 45 40)" fill="#f0a25a" opacity="0.6" />
      <path d="M40 74Q40 63 60 63Q80 63 80 74Q80 93 60 95Q40 93 40 74z" fill="#f7e6cc" />
      <ellipse cx="30" cy="70" rx="6" ry="4" fill="#e3664a" opacity={blush} />
      <ellipse cx="90" cy="70" rx="6" ry="4" fill="#e3664a" opacity={blush} />
      <Eyes mood={mood} f={f} />
      <path d="M53 69Q60 66 67 69Q66 75 60 76Q54 75 53 69z" fill="#24160d" />
      <Mouth mood={mood} f={f} />
    </>
  );
}

// --- componente -------------------------------------------------------------------------

/** Pisca de vez em quando e segue o ponteiro com os olhos. A única animação em loop do app
 * (MASTER.md): curta, rara, e desligada com "reduzir movimento". */
function useAlive(root: React.RefObject<SVGSVGElement | null>, enabled: boolean, mood: PilaMood, ey: number) {
  useEffect(() => {
    const svg = root.current;
    if (!enabled || !svg || !window.matchMedia(FULL).matches) return;
    let timer = 0;
    const blink = () => {
      const eyes = svg.querySelector<SVGGElement>("[data-eyes]");
      if (eyes)
        gsap.fromTo(eyes, { scaleY: 1 }, { scaleY: 0.1, svgOrigin: `60 ${ey}`, duration: 0.09, yoyo: true, repeat: 1, ease: "power1.inOut" });
      timer = window.setTimeout(blink, 2600 + Math.random() * 3600);
    };
    timer = window.setTimeout(blink, 1200 + Math.random() * 2000);

    const look = (e: PointerEvent) => {
      const pupils = svg.querySelector<SVGGElement>("[data-pupils]");
      if (!pupils) return;
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.45);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 300) * 3;
      gsap.to(pupils, { x: (dx / d) * k, y: (dy / d) * k, duration: 0.25, ease: "power2.out", overwrite: true });
    };
    window.addEventListener("pointermove", look);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", look);
    };
  }, [root, enabled, mood, ey]);
}

let clipSeq = 0;

/** O mascote ativo (ou `mascot`, para mostrar um específico, como na escolha do Perfil). */
export function Pila({
  mood = "neutral",
  size = 120,
  coin = false,
  alive = false,
  mascot,
  className,
  label,
}: {
  mood?: PilaMood;
  size?: number;
  /** Uma moeda cai pela fenda, uma vez (cofrinho cresceu, mês fechou no azul). */
  coin?: boolean;
  /** Pisca e segue o ponteiro com os olhos. Só onde ele é o centro da tela (login, vazio). */
  alive?: boolean;
  mascot?: MascotId;
  className?: string;
  /** Texto para leitor de tela; sem ele o mascote é decorativo. */
  label?: string;
}) {
  const active = useMascot().id;
  const id = mascot ?? active;
  const f = FACES[id];
  const root = useRef<SVGSVGElement>(null);
  const [clip] = useState(() => `mascot-clip-${++clipSeq}`);
  useAlive(root, alive, mood, f.ey);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        const q = gsap.utils.selector(root);
        const tl = gsap.timeline();
        tl.from(root.current, { y: 8, autoAlpha: 0, duration: 0.45, ease: "power3.out" });
        if (mood === "celebrate") tl.from(q("[data-body]"), { y: -6, duration: 0.5, ease: "back.out(3)" }, 0.1);
        if (coin) {
          tl.fromTo(
            q("[data-coin]"),
            { y: -28, autoAlpha: 0 },
            { y: 12, autoAlpha: 1, duration: 0.5, ease: "power2.in" },
            0.25,
          ).to(q("[data-coin]"), { autoAlpha: 0, duration: 0.12 });
        }
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [mood, coin, id], revertOnUpdate: true },
  );

  return (
    <svg
      ref={root}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={cx("shrink-0 overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <ellipse cx="60" cy="112" rx="32" ry="4.5" fill="#000" opacity="0.16" />
      <g data-coin style={{ visibility: coin ? undefined : "hidden" }}>
        <circle cx="60" cy="14" r="8" fill="var(--coin)" stroke="var(--coin-line)" strokeWidth="2.5" />
        <path d="M60 9.5v9" stroke="var(--coin-line)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g data-body>
        {id === "casco" ? (
          <CascoBody mood={mood} f={f} clip={clip} />
        ) : id === "guara" ? (
          <GuaraBody mood={mood} f={f} />
        ) : (
          <PilaBody mood={mood} f={f} />
        )}
      </g>
    </svg>
  );
}

/** Mascote com um balão de fala. */
export function PilaSays({
  mood,
  children,
  size = 96,
  coin,
  alive,
  side = "right",
}: {
  mood: PilaMood;
  children: ReactNode;
  size?: number;
  coin?: boolean;
  alive?: boolean;
  side?: "left" | "right";
}) {
  return (
    <div className={cx("flex items-end gap-3", side === "left" && "flex-row-reverse")}>
      <Pila mood={mood} size={size} coin={coin} alive={alive} />
      <p
        className={cx(
          "mb-6 max-w-56 rounded-card bg-surface-2 px-3.5 py-2.5 text-sm leading-snug",
          side === "right" ? "rounded-bl-[4px]" : "rounded-br-[4px]",
        )}
      >
        {children}
      </p>
    </div>
  );
}
