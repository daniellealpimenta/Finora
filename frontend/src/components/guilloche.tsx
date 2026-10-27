"use client";

import { useEffect, useRef } from "react";

import { cx } from "./ui";

/**
 * Guilhoché: o padrão de linhas gravadas das cédulas, em latão e bem apagado. Só no card do
 * topo da Visão geral e no login (MASTER.md, "Assinatura"). Estático: nada se mexe.
 * Fica atrás do conteúdo; o pai precisa de `relative isolate overflow-hidden`.
 */
export function Guilloche({
  className,
  // Centro da roseta, em fração da largura/altura do pai
  x = 0.86,
  y = 0.55,
}: {
  className?: string;
  x?: number;
  y?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const draw = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      el.width = width * dpr;
      el.height = height * dpr;
      const c = el.getContext("2d");
      if (!c) return;
      c.scale(dpr, dpr);
      c.strokeStyle = getComputedStyle(el).getPropertyValue("--accent").trim() || "#d2ac6a";
      c.globalAlpha = 0.16;
      c.lineWidth = 0.8;
      const cx0 = width * x;
      const cy0 = height * y;
      const base = Math.min(width, height) * 0.22;
      for (let k = 0; k < 18; k++) {
        c.beginPath();
        const R = base + k * 7;
        for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.01) {
          const r = R + 14 * Math.sin(12 * t + k * 0.35) + 6 * Math.sin(5 * t);
          const px = cx0 + r * Math.cos(t);
          const py = cy0 + r * 0.78 * Math.sin(t);
          if (t === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.stroke();
      }
    };
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(el);
    // Troca de tema muda a cor do latão
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", draw);
    return () => {
      resize.disconnect();
      theme.disconnect();
      scheme.removeEventListener("change", draw);
    };
  }, [x, y]);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={cx("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
