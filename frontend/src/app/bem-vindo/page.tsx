"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CoinMark } from "@/components/chrome";
import { CoinTrail } from "@/components/onboarding/sketch";
import {
  AssistantStep,
  ConnectStep,
  CycleStep,
  DoneStep,
  MeuPluggyStep,
  PasswordStep,
  PluggyKeysStep,
  WelcomeStep,
} from "@/components/onboarding/steps";
import { Pila } from "@/components/pila";
import { skipRecapBefore } from "@/components/recap";
import { api, type Me, type SetupStatus } from "@/lib/api";
import type { CycleInfo } from "@/lib/cycle";
import { FULL, gsap, motion, useGSAP } from "@/lib/motion";

// A ordem das moedas no rodapé; "pronto" é a tela final, sem moeda
const STEPS = ["oi", "senha", "meu-pluggy", "chave", "conectar", "ciclo", "pila", "pronto"] as const;
type Step = (typeof STEPS)[number];
const COINS = STEPS.length - 1;

/** Onde retomar: o passo salvo, ou o primeiro que ainda falta. */
function resumeAt(status: SetupStatus): Step {
  if (!status.has_user) return "oi";
  if (status.step && (STEPS as readonly string[]).includes(status.step)) return status.step as Step;
  if (!status.pluggy_configured) return "meu-pluggy";
  if (!status.has_connection) return "conectar";
  return "ciclo";
}

export default function WelcomePage() {
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    (async () => {
      const s = await api<SetupStatus>("/setup/status");
      if (s.done) return router.replace("/");
      if (s.has_user) {
        // Já tem senha: precisa estar logado para continuar (o login volta para cá)
        const me = await api<Me>("/auth/me").catch(() => null);
        if (!me) return router.replace("/login");
      }
      setStatus(s);
      setStep(resumeAt(s));
    })().catch(() => router.replace("/login"));
  }, [router]);

  // Cada passo entra subindo, como as páginas do app
  useGSAP(
    () => {
      if (!step) return;
      const mm = gsap.matchMedia();
      mm.add(FULL, () => {
        gsap.from(gsap.utils.selector(root)("[data-enter]"), {
          y: motion.enter.y,
          autoAlpha: 0,
          duration: motion.enter.duration,
          ease: motion.enter.ease,
          stagger: motion.enter.stagger,
          clearProps: "transform,opacity,visibility",
        });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [step], revertOnUpdate: true },
  );

  if (!status || !step) return null;

  const index = STEPS.indexOf(step);
  function go(target: Step) {
    setStep(target);
    window.scrollTo({ top: 0 });
    // Depois da senha já há login: guarda onde parou para retomar se fechar o app
    if (STEPS.indexOf(target) > STEPS.indexOf("senha")) {
      api("/setup/progress", { method: "PUT", body: JSON.stringify({ step: target }) }).catch(() => {});
    }
  }
  // A senha não se refaz: voltar dali para trás pula para o passo antes dela
  const next = () => go(STEPS[index + 1]);
  const back = index > 0 && STEPS[index - 1] !== "senha" ? () => go(STEPS[index - 1]) : undefined;
  const props = { n: index + 1, total: COINS, next, back };

  async function finish() {
    await api("/setup/progress", { method: "PUT", body: JSON.stringify({ step: "pronto", done: true }) });
    const cycle = await api<CycleInfo>("/dashboard/cycle").catch(() => null);
    if (cycle) skipRecapBefore(cycle.current_key);
    router.replace("/");
  }

  return (
    <main
      ref={root}
      className="theme-dark flex min-h-screen flex-col bg-background text-foreground"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 pt-8 sm:px-10 sm:pt-11">
        <div className="flex items-center gap-2.5 font-display text-[17px] font-bold">
          <CoinMark />
          Finora
        </div>

        {step === "oi" && <WelcomeStep {...props} />}
        {step === "senha" && <PasswordStep {...props} />}
        {step === "meu-pluggy" && <MeuPluggyStep {...props} />}
        {step === "chave" && <PluggyKeysStep {...props} configured={status.pluggy_configured} />}
        {step === "conectar" && <ConnectStep {...props} />}
        {step === "ciclo" && <CycleStep {...props} />}
        {step === "pila" && <AssistantStep {...props} />}
        {step === "pronto" && <DoneStep finish={finish} />}

        {step !== "pronto" && (
          <footer className="mt-4 flex items-end gap-4 border-t border-border pt-4 pb-5">
            <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
              <CoinTrail total={COINS} current={index} />
              <span className="text-[13px] text-muted">
                {index === 0
                  ? "Cada passo é uma moeda no cofrinho."
                  : `${index} ${index === 1 ? "moeda" : "moedas"} no cofrinho. Pode fechar e voltar depois.`}
              </span>
            </div>
            {/* A moeda cai no Pila a cada passo concluído */}
            <Pila key={step} mood="happy" size={64} coin={index > 0} />
          </footer>
        )}
      </div>
    </main>
  );
}
