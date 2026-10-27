import { api, type Connection } from "@/lib/api";

// Aplicação Pluggy em trial só cria itens do sandbox e do MeuPluggy
// (bancos reais -> 400 TRIAL_CLIENT_ITEM_CREATE_NOT_ALLOWED). Os bancos reais
// são conectados em https://meu.pluggy.ai e chegam aqui pelo conector MeuPluggy.
export const MEU_PLUGGY_CONNECTOR_ID = 200;

type Options = {
  sandbox?: boolean;
  onConnected: (connection: Connection, institution: string) => void | Promise<void>;
  onError: (message: string) => void;
  onClose: () => void;
};

/** Abre o widget Pluggy Connect e registra o item conectado na API (que já começa o sync). */
export async function openPluggyConnect({ sandbox = false, onConnected, onError, onClose }: Options) {
  const { access_token } = await api<{ access_token: string }>("/pluggy/connect-token", {
    method: "POST",
  });
  // Carregado só no navegador (o SDK usa window)
  const { PluggyConnect } = await import("pluggy-connect-sdk");
  const widget = new PluggyConnect({
    connectToken: access_token,
    includeSandbox: sandbox,
    ...(sandbox ? {} : { connectorIds: [MEU_PLUGGY_CONNECTOR_ID] }),
    onSuccess: async ({ item }) => {
      const connection = await api<Connection>("/connections", {
        method: "POST",
        body: JSON.stringify({ item_id: item.id }),
      });
      await onConnected(connection, item.connector?.name ?? "Banco");
    },
    onError: ({ message }) => onError(`Pluggy: ${message}`),
    onClose,
  });
  await widget.init();
}
