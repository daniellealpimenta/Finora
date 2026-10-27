# ManagerFinance

Sistema pessoal de finanças que importa automaticamente as transações dos seus bancos
(Open Finance via [Pluggy](https://pluggy.ai) / Meu Pluggy), categoriza os gastos e gera
dashboards, estatísticas e índices de saúde financeira.

**Roda 100% local.** A API escuta só em `127.0.0.1`; nada é exposto à rede.
Seus dados bancários passam pela Pluggy (necessário para o Open Finance), mas a sua cópia
fica só na sua máquina.

## Estrutura

```
backend/    FastAPI + SQLAlchemy + Alembic + SQLite (Python 3.12, uv)
frontend/   Next.js 15 + Tailwind
```

## Primeiros passos

### 1. Configuração

```bash
cp .env.example .env
# gere JWT_SECRET e FIELD_ENCRYPTION_KEY (comandos no próprio .env.example)
```

### 2. Validar a Pluggy (fase 0)

1. Crie uma conta em https://dashboard.pluggy.ai, crie uma aplicação e copie
   `CLIENT_ID`/`CLIENT_SECRET` para o `.env`.
2. Conecte seus bancos no [Meu Pluggy](https://meu.pluggy.ai).
3. No dashboard da Pluggy, use o Connect/Demo da sua aplicação para conectar o conector
   **MeuPluggy** e anote o `itemId` gerado.
4. Rode:

```bash
cd backend
uv sync
uv run python -m scripts.pluggy_check <item_id> --days 30
```

### 3. Rodar o sistema

Não precisa de Docker nem de servidor de banco: o banco é um arquivo SQLite em
`%LOCALAPPDATA%\ManagerFinance\managerfinance.db`, fora do OneDrive (no macOS:
`~/Library/Application Support/ManagerFinance/`).

Primeira vez (dentro de `backend/`):

```bash
uv run alembic upgrade head                               # cria/atualiza o banco
uv run python -m scripts.create_user voce@exemplo.com     # cria seu usuário
```

Depois, em dois terminais:

```bash
cd backend && uv run uvicorn app.main:app --reload        # API: http://localhost:8000/docs
cd frontend && npm install && npm run dev                 # app: http://localhost:3000
```

**Backup:** com o backend parado, copie o arquivo `managerfinance.db`.

### Depois de atualizar o código

Sempre que houver migração nova (pasta `backend/migrations/versions`), rode dentro de
`backend/`: `uv run alembic upgrade head`.

### Programa para Windows (.exe)

O mesmo código também vira um programa com janela própria, sem terminais nem navegador.
O modo web acima continua funcionando igual; os dois usam o mesmo banco (só não rode os dois
ao mesmo tempo).

```powershell
.\scripts\build-desktop.ps1      # gera o .exe e instala, com atalho no Menu Iniciar
```

- Uma vez: copie o `.env` do projeto para `%LOCALAPPDATA%\ManagerFinance\.env`
  (o programa não roda dentro da pasta do projeto).
- Fica instalado em `%LOCALAPPDATA%\Programs\ManagerFinance` (fora do OneDrive). Para fixar
  na barra de tarefas: Menu Iniciar → ManagerFinance → botão direito → Fixar na barra de
  tarefas. Reinstalar (rodar o script de novo, com o app fechado) mantém o atalho.
- O programa aplica as migrações sozinho, guardando antes `managerfinance.db.bak`.
- O sync automático roda enquanto a janela estiver aberta. Log em
  `%LOCALAPPDATA%\ManagerFinance\logs\app.log`.
- Mudou o código? Rode o script de novo.

## Como usar

- **Contas → Conectar banco**: abre o widget da Pluggy. Marque "Mostrar bancos de teste"
  para experimentar com o Pluggy Bank (`user-ok` / `password-ok`) antes de conectar
  contas reais. O primeiro sync traz até 12 meses.
- **Sincronização**: automática a cada 6 h enquanto o backend estiver rodando
  (`SYNC_INTERVAL_HOURS`), ou pelo botão "Sincronizar agora".
- **Importar OFX**: para bancos sem Open Finance; reimportar não duplica.
- **Transações**: trocar a categoria pode criar uma regra que vale para as parecidas
  (atuais e futuras).
- **Orçamentos**: limite por categoria, vale do mês escolhido em diante.
- **Visão geral**: receitas x despesas, taxa de poupança, projeção do mês, reserva de
  emergência, gastos fixos/assinaturas detectados, gastos acima da média, parcelas
  futuras e um score de saúde financeira (poupança 40 + reserva 30 + gastos fixos 30).

### Testes e lint

```bash
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
cd frontend && npm run lint && npm run build
```

## Segurança

- Login com senha; 2FA (TOTP) opcional com `create_user --totp`; token JWT de curta duração
- IDs de conexão da Pluggy criptografados no banco (`FIELD_ENCRYPTION_KEY`)
- O segredo da Pluggy nunca sai do backend; clientes recebem só um *connect token* temporário
- Recomendado: BitLocker ativo e manter o projeto **fora do OneDrive**, para o `.env`
  não ser sincronizado com a nuvem

## Roadmap

0. ✅ Validação da Pluggy (`scripts/pluggy_check.py`)
1. ✅ Fundação: API, auth, modelo de dados, migrações, frontend com login
2. ✅ Ingestão: sync periódico (Pluggy v2), deduplicação, importação OFX, categorização por regras
3. ✅ Dashboards e índices (taxa de poupança, reserva de emergência, comprometimento de renda…)
4. IA: categorização por LLM, agentes de insights, chat
5. App iOS (SwiftUI) usando esta mesma API
