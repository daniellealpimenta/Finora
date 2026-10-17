"""Fase 0: valida o acesso à Pluggy com contas reais.

Pré-requisitos:
  1. Conta em https://dashboard.pluggy.ai -> crie uma aplicação e copie CLIENT_ID/SECRET.
  2. Conecte seus bancos no Meu Pluggy (https://meu.pluggy.ai) e, pelo Pluggy Connect da
     sua aplicação, conecte o conector "MeuPluggy" para obter o(s) item id(s).
  3. Preencha PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET no .env.

Uso (dentro de backend/):
  uv run python -m scripts.pluggy_check <item_id> [<item_id> ...] [--days 30]
  uv run python -m scripts.pluggy_check --connect-token   # gera token p/ o widget Connect
"""

import argparse
from datetime import date, timedelta

from app.integrations.pluggy.client import PluggyClient


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("item_ids", nargs="*", help="IDs de items da Pluggy")
    parser.add_argument("--days", type=int, default=30, help="janela de transações (dias)")
    parser.add_argument("--connect-token", action="store_true", help="só gera um connect token")
    args = parser.parse_args()

    with PluggyClient() as pluggy:
        print("Autenticação Pluggy OK")

        if args.connect_token:
            print(f"Connect token (válido por 30 min):\n{pluggy.create_connect_token()}")
            return

        if not args.item_ids:
            parser.error("informe ao menos um item_id (ou use --connect-token)")

        date_from = date.today() - timedelta(days=args.days)
        for item_id in args.item_ids:
            item = pluggy.get_item(item_id)
            connector = item.get("connector", {}).get("name", "?")
            print(f"\n=== Item {item_id} | {connector} | status={item.get('status')} ===")

            for acc in pluggy.list_accounts(item_id):
                print(
                    f"\n  [{acc['type']}/{acc.get('subtype')}] {acc['name']} "
                    f"saldo={acc.get('balance')} {acc.get('currencyCode', '')}"
                )
                txs = list(pluggy.iter_transactions(acc["id"], date_from=date_from))
                print(f"  {len(txs)} transações nos últimos {args.days} dias")
                for tx in txs[:10]:
                    print(
                        f"    {tx['date'][:10]}  {tx['type']:<6} {tx['amount']:>12.2f}  "
                        f"{(tx.get('category') or '-'):<25.25} {tx['description'][:50]}"
                    )


if __name__ == "__main__":
    main()
