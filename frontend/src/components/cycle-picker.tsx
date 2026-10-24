"use client";

import { cycleName, cycleRange, type CycleInfo } from "@/lib/cycle";
import { InfoTip } from "./info-tip";
import { MonthPicker } from "./ui";

/** Seletor de ciclo: "Ciclo de setembro · 09/09 a 08/10", com a explicação do que é um ciclo. */
export function CyclePicker({
  value,
  info,
  onChange,
}: {
  value: string;
  info: CycleInfo | null;
  onChange: (key: string) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <MonthPicker
        value={value}
        onChange={onChange}
        unit="Ciclo"
        label={`Ciclo de ${cycleName(value)}`}
        caption={info ? `${cycleRange(info)}${info.is_current ? ", atual" : ""}` : " "}
      />
      <InfoTip label="O que é um ciclo" align="end">
        {info?.start_day ? (
          <p>
            Seus ciclos vão do dia {info.start_day} até o dia {info.start_day === 1 ? "último" : info.start_day - 1}{" "}
            do mês seguinte. O <strong>ciclo de setembro</strong> é o que começa em {info.start_day}/09.
          </p>
        ) : (
          <p>
            O ciclo acompanha a fatura do cartão: vai do dia seguinte a um fechamento até o próximo. O{" "}
            <strong>ciclo de setembro</strong> é o que começa em setembro e termina quando a fatura fecha em outubro.
          </p>
        )}
        <p>
          Tudo que entra e sai da conta nesse período conta nele. As compras no cartão contam no ciclo em que a fatura
          delas fecha, como no app do banco.
        </p>
        {info?.start_day ? (
          <p className="text-muted">Dia escolhido por você. Dá para mudar em Contas.</p>
        ) : (
          info?.reference_card && (
            <p className="text-muted">
              O fechamento vem do cartão {info.reference_card}. Você pode escolher outro dia de início em Contas.
            </p>
          )
        )}
      </InfoTip>
    </span>
  );
}
