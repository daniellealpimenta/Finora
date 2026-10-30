// Respostas de /needs/* (backend/app/services/needs.py)

/** Uma carta do jogo: um gasto do ciclo */
export type NeedCard = {
  id: number;
  date: string;
  label: string;
  description: string;
  amount: number;
  category_name: string;
  category_key: string | null;
  /** true precisava, false foi vontade, null ainda não jogada */
  need: boolean | null;
};

export type NeedsSummary = {
  need: number;
  want: number;
  /** Gastos ainda sem classificar */
  open: number;
  /** vontade ÷ (precisava + vontade); null sem nenhuma carta jogada */
  want_share: number | null;
  count: number;
  open_count: number;
  previous_want_share: number | null;
  /** Quanto sobraria por ciclo cortando metade da vontade */
  half_want: number;
  top_categories: { name: string; amount: number }[];
  top_merchants: { name: string; amount: number }[];
  history: { key: string; want_share: number | null; want: number }[];
};
