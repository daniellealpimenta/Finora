"use client";

// Som de moeda (MASTER.md, "Som"): ligado por padrão e desligado pelo botão do topo. Um "tlim"
// curto quando dinheiro entra (cofrinho cresceu, sync trouxe novidade, fechou no azul).
// Sintetizado na hora, sem arquivo de áudio. A escolha fica no localStorage: é de quem usa.

const KEY = "mf_sound";
let ctx: AudioContext | null = null;

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

/** Duas notas agudas que somem rápido, a segunda um pouco depois: "tlim". */
export function playCoin(force = false) {
  if (!force && !soundOn()) return;
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    for (const [freq, at] of [
      [1568, 0],
      [2093, 0.07],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.12, now + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.4);
    }
  } catch {
    /* sem áudio neste navegador: segue em silêncio */
  }
}
