"use client";

// Sons do app (MASTER.md, "Som"): cinco sons curtos, todos em Dó maior para soarem como família,
// cada um com um significado só. Sintetizados na hora, sem arquivo de áudio. Ligado por padrão;
// o onboarding pergunta e o botão do topo desliga. A escolha fica no localStorage: é de quem usa.

const KEY = "mf_sound";
const VOLUME = 0.12;
let ctx: AudioContext | null = null;

/**
 * - `coin`: dinheiro entrou (sync com novidade, cofrinho cresceu, moeda no pote)
 * - `tap`: ação confirmada (salvar, trocar categoria, jogar carta)
 * - `whoosh`: algo abriu ou fechou (fechamento do ciclo, cofre)
 * - `low`: atenção (orçamento estourado, senha errada), sem cara de alarme
 * - `fanfare`: conquista (meta do pote batida, ciclo fechou no azul)
 * - `tick`, `clunk`, `latch`, `door`: o cofre abrindo depois do login (segredo, ferrolhos,
 *   maçaneta e a porta pesada)
 */
export type SoundKind = "coin" | "tap" | "whoosh" | "low" | "fanfare" | "tick" | "clunk" | "latch" | "door";

export function soundOn(): boolean {
  try {
    // Só fica mudo quem desligou no botão
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage indisponível: vale só até recarregar */
  }
}

function tone(
  c: AudioContext,
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType = "sine",
  gain = 1,
  attack = 0.01,
  cutoff: number | null = 2200,
) {
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(VOLUME * gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (cutoff) {
    // Corta o brilho de cima: o som fica redondo, sem chiado agudo
    const soft = c.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = cutoff;
    osc.connect(soft).connect(env);
  } else osc.connect(env);
  env.connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Ruído filtrado: sopro, clique metálico, baque, rangido (o filtro e a curva dão o caráter). */
function noise(
  c: AudioContext,
  at: number,
  dur: number,
  { type = "bandpass", from, to = from, q = 1, gain = 1, attack = 0.005 }:
    { type?: BiquadFilterType; from: number; to?: number; q?: number; gain?: number; attack?: number },
) {
  const t = c.currentTime + at;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(VOLUME * gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(c.destination);
  src.start(t);
}

const SOUNDS: Record<SoundKind, (c: AudioContext) => void> = {
  // Duas notas agudas que somem rápido, a segunda um pouco depois: "tlim" (o de sempre, sem filtro)
  coin: (c) => {
    tone(c, 1568, 0, 0.35, "sine", 1, 0.01, null);
    tone(c, 2093, 0.07, 0.35, "sine", 1, 0.01, null);
  },
  // Toque bem discreto (2026-11-07): um "tuc" curto e grave, baixinho, com a altura variando um
  // pouco a cada vez (±4%) para não cansar quando se clica muito
  tap: (c) => tone(c, 520 * (0.96 + Math.random() * 0.08), 0, 0.045, "sine", 0.45, 0.004, 1400),
  whoosh: (c) => noise(c, 0, 0.32, { from: 400, to: 2400, q: 1.2, gain: 1.4, attack: 0.12 }),
  // Sol e Mi bemol descendo: avisa sem assustar
  low: (c) => {
    tone(c, 392, 0, 0.18, "triangle");
    tone(c, 311, 0.14, 0.26, "triangle");
  },
  // Dó, Mi, Sol subindo
  fanfare: (c) => {
    tone(c, 523, 0, 0.18);
    tone(c, 659, 0.1, 0.18);
    tone(c, 784, 0.2, 0.36);
  },
  // Cofre (abertura depois do login): o clique do segredo passando por cada número
  tick: (c) => noise(c, 0, 0.012, { type: "bandpass", from: 3200, q: 4, gain: 0.5, attack: 0.001 }),
  // Ferrolho recolhendo: baque grave de metal pesado
  clunk: (c) => {
    tone(c, 150, 0, 0.12, "sine", 1.6, 0.003, 600);
    noise(c, 0, 0.07, { type: "lowpass", from: 900, to: 300, gain: 0.9, attack: 0.002 });
  },
  // Maçaneta travando no fim do giro: "clac" metálico duplo
  latch: (c) => {
    noise(c, 0, 0.03, { type: "bandpass", from: 1800, q: 6, gain: 1, attack: 0.001 });
    noise(c, 0.06, 0.04, { type: "bandpass", from: 1200, q: 5, gain: 0.8, attack: 0.001 });
    tone(c, 220, 0.06, 0.15, "triangle", 0.8, 0.003, 800);
  },
  // Porta pesada abrindo: rangido grave subindo, um ronco por baixo e o ar entrando no fim
  door: (c) => {
    noise(c, 0, 1.1, { type: "bandpass", from: 180, to: 520, q: 9, gain: 0.9, attack: 0.25 });
    tone(c, 55, 0, 1.0, "sine", 1.3, 0.2, 300);
    noise(c, 0.55, 0.7, { type: "bandpass", from: 500, to: 1800, q: 0.9, gain: 0.7, attack: 0.3 });
  },
};

export function playSound(kind: SoundKind, force = false) {
  if (!force && !soundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    SOUNDS[kind](ctx);
  } catch {
    /* sem áudio neste navegador: segue em silêncio */
  }
}

export function playCoin(force = false) {
  playSound("coin", force);
}
