"use client";

import { useEffect, useState } from "react";

/**
 * Contador mecânico (MASTER.md, "Movimento"): cada dígito é uma coluna 0–9 que rola até o
 * valor, como uma máquina de contar moedas. Na primeira vez rola a partir do zero; depois,
 * do valor anterior. As colunas são casadas pela direita, então "999" → "1.000" rola certo.
 * Com "reduzir movimento" o CSS tira a transição e o valor aparece direto.
 */
export function Odometer({ text, className }: { text: string; className?: string }) {
  // Primeiro quadro com tudo em zero, para o rolar aparecer ao montar
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const chars = text.split("");
  let digitIndex = 0;

  return (
    <span className={className} aria-label={text}>
      {chars.map((ch, i) => {
        const fromRight = chars.length - i;
        if (!/\d/.test(ch)) {
          return (
            <span key={`s${fromRight}`} aria-hidden className="odometer-sep">
              {ch}
            </span>
          );
        }
        const n = ready ? Number(ch) : 0;
        // Cascata da esquerda para a direita, como os rolos de um contador
        const delay = digitIndex++ * 45;
        return (
          <span key={`d${fromRight}`} aria-hidden className="odometer-digit">
            <span
              className="odometer-col"
              style={{ transform: `translateY(-${n}em)`, transitionDelay: `${delay}ms` }}
            >
              {"0123456789".split("").map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
