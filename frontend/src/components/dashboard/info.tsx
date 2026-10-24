import type { ReactNode } from "react";

// Textos do ícone (i) de cada card da Visão geral. Os números citados seguem o backend
// (app/services/analytics.py e cycles.py); se um limite mudar lá, mude aqui também.

const CYCLE_NOTE = (
  <p className="text-muted">
    Ciclo = do dia de início escolhido em Contas até a véspera dele no mês seguinte (sem escolha, do dia seguinte ao
    fechamento da fatura até o próximo). As compras no cartão contam no ciclo em que a fatura delas fecha.
  </p>
);

export const INFO_CURRENT_BALANCE: ReactNode = (
  <>
    <p>
      <strong>Livre agora</strong> é o dinheiro que você tem para o resto do ciclo: o que está em conta menos as faturas
      que já são deste ciclo (a fatura aberta até agora) e as fechadas ainda não pagas.
    </p>
    <ul>
      <li>
        <strong>Começou com:</strong> o que estava livre quando o ciclo começou, ou seja, o que sobrou dos ciclos
        anteriores.
      </li>
      <li>
        <strong>Entrou e saiu até agora:</strong> salário e Pix recebidos, gastos pela conta, a fatura do ciclo até
        hoje e o que foi guardado.
      </li>
      <li>O que está nos cofrinhos não entra: aparece no card Cofrinhos.</li>
    </ul>
    {CYCLE_NOTE}
  </>
);

export const INFO_MONTH_LEFT: ReactNode = (
  <>
    <p>
      <strong>Terminou com</strong> é o dinheiro livre no fim do ciclo: o que estava em conta menos as faturas ainda a
      pagar. É o número que bate com o banco.
    </p>
    <p>
      <strong>Resultado do ciclo</strong> é só o que aconteceu dentro dele: o que entrou − gastos pela conta − a fatura do
      ciclo − o que foi guardado. Se for negativo, o ciclo usou parte do que tinha sobrado antes; o “terminou com” ainda
      pode ser positivo.
    </p>
    <ul>
      <li>
        <strong>Entrou na conta:</strong> salário, Pix recebidos e outras receitas que caíram durante o ciclo.
      </li>
      <li>
        <strong>Gastos pela conta:</strong> Pix, débito e boletos pagos direto da conta.
      </li>
      <li>
        <strong>Faturas do ciclo:</strong> as faturas que fecham dentro do ciclo, pelo valor total, mesmo que sejam
        pagas depois. O pagamento em si não conta de novo.
      </li>
      <li>
        <strong>Guardado nos cofrinhos:</strong> aportes menos resgates. Se você resgatou mais do que guardou, o valor
        fica positivo.
      </li>
      <li>
        <strong>Terminou com</strong> = começou com + o que sobrou. É o que passa para o próximo ciclo.
      </li>
    </ul>
    <p>
      <strong>Bate com o banco:</strong> no fim do ciclo, o saldo em conta menos as faturas ainda a pagar deve dar o
      “terminou com”. Se não der, provavelmente teve um saque ou um Pix para uma conta que não está conectada.
    </p>
    <p className="text-muted">
      Transferências entre as suas contas se anulam. Um Pix de outra pessoa que vai direto para um cofrinho
      compartilhado não conta como entrada sua.
    </p>
  </>
);

export const INFO_HEALTH: ReactNode = (
  <>
    <p>Uma nota de 0 a 100 que soma três partes:</p>
    <ul>
      <li>
        <strong>Taxa de poupança (até 40):</strong> quanto das receitas não virou despesa, ou seja, (receitas − despesas)
        ÷ receitas, somando os 3 últimos ciclos fechados. O ciclo em andamento fica de fora porque oscila demais: logo
        depois do salário a taxa parece altíssima e, antes dele, negativa. Com 20% ou mais você ganha os 40 pontos; com
        10%, ganha 20.
      </li>
      <li>
        <strong>Reserva (até 30):</strong> meses de reserva de emergência. Com 6 meses ou mais, ganha os 30 pontos.
      </li>
      <li>
        <strong>Gastos fixos (até 30):</strong> quanto da renda vai para gastos recorrentes e parcelas. Até 30% da renda
        dá 30 pontos; a partir de 70%, zero.
      </li>
    </ul>
    <p className="text-muted">70 ou mais é Boa; de 40 a 69, Atenção; abaixo de 40, Crítica.</p>
  </>
);

export const INFO_RESERVE: ReactNode = (
  <>
    <p>Quantos meses você se mantém, no seu padrão atual de gastos, se a renda parar hoje.</p>
    <p>
      <strong>Cálculo:</strong> (saldo em conta − faturas a pagar + cofrinhos) ÷ despesa média dos 3 ciclos anteriores.
      O dinheiro que já é do cartão não conta como reserva.
    </p>
    <p className="text-muted">Meta: 6 meses. A partir de 6 meses é Boa; de 3 a 6, Atenção; abaixo de 3, Crítica.</p>
  </>
);

export const INFO_FIXED: ReactNode = (
  <>
    <p>
      Quanto da sua renda já está comprometido antes de o ciclo começar, com assinaturas, contas que se repetem e
      parcelas.
    </p>
    <p>
      <strong>Cálculo:</strong> (gastos recorrentes + parcelas em andamento, por ciclo) ÷ receita média dos 3 ciclos
      anteriores.
    </p>
    <p>
      Um gasto conta como recorrente quando aparece em pelo menos 3 dos últimos 6 ciclos, com valor parecido (até 25%
      de diferença), e ainda está ativo. As parcelas entram pelo valor de cada uma, até a última.
    </p>
    <p className="text-muted">Ideal: até 30% da renda. Até 50% é Atenção; acima disso, Crítica.</p>
  </>
);

export const INFO_SAVINGS: ReactNode = (
  <>
    <p>
      O saldo atual dos seus cofrinhos e caixinhas. O banco informa esse saldo pelo Open Finance, separado do saldo em
      conta.
    </p>
    <ul>
      <li>
        Cada depósito chega como uma aplicação. As aplicações com a mesma taxa são agrupadas num cofrinho. Você pode
        renomear e reorganizar em <strong>Organizar</strong>.
      </li>
      <li>
        <strong>Rendeu:</strong> saldo de hoje menos o valor aplicado em cada cofrinho (bruto, antes do IR). A lista
        completa está na página Cofrinhos.
      </li>
      <li>
        <strong>Guardado no ciclo:</strong> aportes menos resgates do ciclo escolhido. Pix de outra pessoa para o
        cofrinho compartilhado não conta como dinheiro guardado por você.
      </li>
    </ul>
    <p className="text-muted">Entra no cálculo da reserva de emergência.</p>
  </>
);

export const INFO_INSTALLMENTS: ReactNode = (
  <>
    <p>As compras parceladas no cartão que ainda têm parcelas a pagar.</p>
    <p>
      <strong>Falta pagar:</strong> número de parcelas restantes × valor da parcela. A data final é estimada a partir da
      última parcela conhecida.
    </p>
  </>
);

export const INFO_CASHFLOW: ReactNode = (
  <>
    <p>Receitas e despesas de cada ciclo, nos últimos 12 ciclos.</p>
    <ul>
      <li>As compras no cartão contam no ciclo em que a fatura delas fecha. Parcelas, no ciclo da fatura em que entram.</li>
      <li>Ficam de fora: pagamento de fatura, transferências entre contas suas e cofrinhos.</li>
      <li>Estornos abatem a despesa da mesma categoria.</li>
    </ul>
    <p className="text-muted">
      A “Diferença” mede o seu consumo no ciclo. Ela não desconta o que foi guardado, por isso pode ser maior que o
      “Sobrou no ciclo”.
    </p>
  </>
);

export const INFO_CATEGORIES: ReactNode = (
  <>
    <p>Quanto você gastou em cada categoria no ciclo, com os estornos já descontados.</p>
    <ul>
      <li>O traço na barra marca a média dos 3 ciclos anteriores.</li>
      <li>
        <strong>Acima da média:</strong> aparece quando você gastou 50% a mais que a média e pelo menos R$ 100 a mais.
      </li>
      <li>Quando a categoria tem orçamento, o valor aparece como “de R$ X”.</li>
    </ul>
    <p className="text-muted">Para trocar a categoria de uma transação, vá em Transações.</p>
  </>
);

export const INFO_PACE: ReactNode = (
  <>
    <p>
      O gasto acumulado dia a dia no ciclo, comparado com o ciclo anterior no mesmo dia do ciclo. Se a linha deste ciclo
      está acima, você está gastando mais rápido.
    </p>
    <p className="text-muted">
      Usa as mesmas despesas de “Receitas e despesas”. Compras no cartão feitas antes do ciclo começar (de outra fatura
      que fecha nele) aparecem no 1º dia.
    </p>
  </>
);

export const INFO_COMMITMENTS: ReactNode = (
  <>
    <p>
      Quanto já está comprometido nos próximos ciclos com parcelas de compras que você já fez. O valor vem das parcelas
      futuras que o banco já lançou.
    </p>
  </>
);

export const INFO_MERCHANTS: ReactNode = (
  <>
    <p>Os estabelecimentos em que você mais gastou no ciclo, pela soma das compras. Mostra os 10 primeiros.</p>
  </>
);

export const INFO_RECURRING: ReactNode = (
  <>
    <p>Assinaturas e contas que se repetem todo ciclo.</p>
    <p>
      Um gasto entra aqui quando aparece em pelo menos 3 dos últimos 6 ciclos, com valor parecido (até 25% de
      diferença), e teve cobrança no ciclo atual ou no anterior. O valor por ciclo é a mediana. Parcelamentos ficam de
      fora.
    </p>
  </>
);

export const INFO_BILLS: ReactNode = (
  <>
    <p>As faturas de cada cartão: a que está aberta agora e as fechadas, com fechamento, vencimento e valor.</p>
    <ul>
      <li>
        <strong>Aberta:</strong> compras que ainda não entraram numa fatura fechada. O valor cresce até o fechamento.
      </li>
      <li>
        <strong>Fechada:</strong> o banco já fechou e o vencimento ainda não chegou.
      </li>
      <li>
        <strong>Paga:</strong> um pagamento recebido no cartão, de 25 dias antes até 10 dias depois do vencimento,
        cobriu o total.
      </li>
      <li>
        <strong>Vencida:</strong> passou do vencimento e nenhum pagamento foi encontrado.
      </li>
    </ul>
    <p>
      <strong>Fatura de setembro</strong> é a que fecha no fim do ciclo de setembro, mesmo que vença em outubro.
    </p>
    <p className="text-muted">
      O fechamento é estimado pelas faturas anteriores (a Pluggy não informa a data). Você pode ajustar o dia de cada
      cartão em Contas.
    </p>
  </>
);

export const INFO_CARDS: ReactNode = (
  <>
    <p>Quanto do limite de cada cartão está em uso, como o banco informa pelo Open Finance.</p>
    <ul>
      <li>
        <strong>Usado</strong> = limite − disponível. Inclui a fatura aberta, a fechada ainda não paga e as{" "}
        <strong>parcelas futuras</strong> (a parte hachurada da barra). As parcelas futuras prendem o limite, mas só
        serão cobradas nas próximas faturas.
      </li>
      <li>Por isso o limite usado costuma ser maior que a fatura do ciclo.</li>
    </ul>
    <p className="text-muted">Barra verde até 30% do limite, amarela até 70%, vermelha acima disso.</p>
  </>
);

export const INFO_FORECAST: ReactNode = (
  <>
    <p>
      Quanto dá para gastar no dia a dia até o fim do ciclo <strong>sem deixar de guardar</strong>. Fechar o ciclo no
      zero não é saudável: a meta de guardar sai antes da conta.
    </p>
    <ul>
      <li>
        <strong>Entradas previstas:</strong> o salário (mediana dos 3 últimos ciclos, para uma PLR não inflar a conta) e
        entradas que se repetem com valor parecido em pelo menos 3 dos 4 últimos ciclos. Quando caem, saem da previsão
        e entram no Livre agora.
      </li>
      <li>
        <strong>Contas fixas e parcelas que faltam:</strong> recorrentes que ainda não apareceram no ciclo e parcelas
        que ainda não entraram na fatura dele.
      </li>
      <li>
        <strong>Meta de guardar:</strong> por padrão, 20% do que entra no ciclo (a regra 50/30/20: necessidades,
        desejos e guardar). Vale o que vai para o cofrinho e o que sobra na conta.
      </li>
      <li>
        <strong>Dízimo:</strong> se ligado, o percentual sobre o que sobrou do ciclo anterior mais tudo que entra no
        ciclo, menos o que já foi dado.
      </li>
    </ul>
    <p>
      <strong>Até a próxima entrada</strong> mostra o que o dinheiro de hoje precisa cobrir até o salário cair, já
      tirando as contas que vencem antes dele.
    </p>
    <p className="text-muted">
      O seu ritmo é o gasto médio por dia nos 3 últimos ciclos, sem contas fixas, dízimo e parcelas. Em Ajustar você
      muda a meta, o dízimo e até quando cada entrada conta.
    </p>
  </>
);
