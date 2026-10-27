<div align="center">

<img src="docs/pila.svg" width="140" alt="Pila, o porquinho do Finora" />

# Finora

**Suas finanças, guardadas no seu computador.**

Sistema pessoal de finanças que puxa as transações dos seus bancos via Open Finance,
categoriza os gastos e mostra, ciclo a ciclo, quanto dá para gastar sem apertar.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![GSAP](https://img.shields.io/badge/GSAP-3-88CE02?logo=greensock&logoColor=black)
![Ollama](https://img.shields.io/badge/Ollama-LLM%20local-000000?logo=ollama&logoColor=white)
![Pluggy](https://img.shields.io/badge/Open%20Finance-Pluggy-6E3CF5)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dashboard-dark.png" />
  <img src="docs/screenshots/dashboard-light.png" alt="Visão geral do Finora" />
</picture>

> [!NOTE]
> Todos os prints usam **dados fictícios** (banco de testes "Pluggy Bank"). Nenhum dado real
> aparece neste repositório.

---

## 🔒 Roda 100% local

- 🏠 A API escuta só em `127.0.0.1`; nada é exposto à rede.
- 🏦 Seus dados bancários passam pela [Pluggy](https://pluggy.ai) (necessário para o Open
  Finance), mas a sua cópia fica só na sua máquina, num arquivo SQLite.
- 🤖 O assistente usa um modelo rodando no seu computador (Ollama). Nenhuma transação vai para
  API de terceiros.

## ✨ O que ele faz

| | |
|---|---|
| 🔄 **Sync automático** | Open Finance via Pluggy / Meu Pluggy, a cada 6 h, com deduplicação |
| 🗓️ **Ciclo da fatura** | Tudo organizado pelo período entre fechamentos do cartão, não pelo mês do calendário |
| 💸 **Livre agora** | Saldo em conta menos o que já está comprometido com faturas |
| 📈 **Previsão do ciclo** | Quanto dá para gastar por dia até o fim do ciclo, já guardando a meta |
| 🏷️ **Categorização** | Regras automáticas + correções suas que valem para as transações parecidas |
| 🎯 **Orçamentos** | Limite por categoria, com aviso quando chega perto |
| 🐷 **Cofrinhos** | Agrupa as aplicações (caixinhas, CDBs), acompanha meta e rendimento diário |
| 🎁 **Desejos** | Lista de compras com preço monitorado e "cabe neste ciclo?" |
| 💳 **Cartões e faturas** | Faturas abertas e fechadas, parcelas futuras e limite comprometido |
| ❤️ **Saúde financeira** | Score com taxa de poupança, reserva de emergência e gastos fixos |
| 💬 **Assistente** | Chat com o Pila sobre os seus números, com LLM local |
| 📄 **Importar OFX** | Para bancos sem Open Finance; reimportar não duplica |

## 📸 Telas

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/login-light.png" alt="Login" /><br/><sub><b>Login</b>: senha + 2FA opcional</sub></td>
    <td width="50%"><img src="docs/screenshots/recap-dark.png" alt="Fechamento do ciclo" /><br/><sub><b>Fechamento do ciclo</b>: o resumo do mês que passou</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/transacoes-dark.png" alt="Transações" /><br/><sub><b>Transações</b>: gastos por categoria, troca de categoria direto na lista</sub></td>
    <td><img src="docs/screenshots/orcamentos-light.png" alt="Orçamentos" /><br/><sub><b>Orçamentos</b>: limite por categoria no ciclo</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/cofrinhos-light.png" alt="Cofrinhos" /><br/><sub><b>Cofrinhos</b>: metas e rendimento das aplicações</sub></td>
    <td><img src="docs/screenshots/desejos-dark.png" alt="Desejos" /><br/><sub><b>Desejos</b>: o que cabe neste ciclo sem apertar</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mobile-dashboard.png" width="300" alt="Versão mobile" /><br/>
  <sub>📱 Também funciona no celular</sub>
</p>

## 🐷 Conheça o Pila

O Pila é o porquinho mascote do app. Ele não aparece em todo card, só quando tem algo a
dizer: no login, num estado vazio, quando o ciclo fecha no azul, numa sincronização ou num
erro. Tem seis humores (`happy`, `neutral`, `worried`, `sleep`, `shy`, `celebrate`), pisca de
vez em quando e segue o ponteiro com os olhos. É também a cara do assistente.

Feito em SVG puro e animado com GSAP: veja [`frontend/src/components/pila.tsx`](frontend/src/components/pila.tsx).
Com "reduzir movimento" ligado no sistema, ele fica parado.

## 🧱 Estrutura

```
backend/    FastAPI + SQLAlchemy + Alembic + SQLite (Python 3.12, uv)
frontend/   Next.js 15 + React 19 + Tailwind 4 + GSAP
docs/       notas de arquitetura (assistente local) e prints
scripts/    build do programa para Windows (.exe) e macOS (.app/.dmg)
```

## 🚀 Primeiros passos

### 1. Configuração

```bash
cp .env.example .env
# gere JWT_SECRET e FIELD_ENCRYPTION_KEY (comandos no próprio .env.example)
```

> [!CAUTION]
> O `.env` guarda o segredo da Pluggy e a chave de criptografia. Ele já está no
> `.gitignore`: **nunca o commite**.

### 2. Validar a Pluggy

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
`~/Library/Application Support/ManagerFinance/`). A pasta mantém o nome de antes do Finora.

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

💾 **Backup:** com o backend parado, copie o arquivo `managerfinance.db`.

🔁 **Depois de atualizar o código:** sempre que houver migração nova
(`backend/migrations/versions`), rode `uv run alembic upgrade head` dentro de `backend/`.

### 🖥️ Programa para Windows e macOS

O mesmo código também vira um programa com janela própria, sem terminais nem navegador.
O modo web acima continua funcionando igual; os dois usam o mesmo banco (só não rode os dois
ao mesmo tempo).

**🪟 Windows (.exe)**

```powershell
.\scripts\build-desktop.ps1      # gera o .exe e instala, com atalho no Menu Iniciar
```

- Uma vez: copie o `.env` do projeto para `%LOCALAPPDATA%\ManagerFinance\.env`
  (o programa não roda dentro da pasta do projeto).
- Fica instalado em `%LOCALAPPDATA%\Programs\Finora` (fora do OneDrive). Para fixar
  na barra de tarefas: Menu Iniciar → Finora → botão direito → Fixar na barra de
  tarefas. Reinstalar (rodar o script de novo, com o app fechado) mantém o atalho.
- Log em `%LOCALAPPDATA%\ManagerFinance\logs\app.log`.

**🍎 macOS (.app e .dmg)**

```bash
scripts/build-desktop.sh               # gera o .app e o .dmg e instala em /Applications
scripts/build-desktop.sh --no-install  # só gera
```

- Na primeira vez o script copia o `.env` do projeto para
  `~/Library/Application Support/ManagerFinance/.env` (só se ainda não existir).
- Abra pelo Launchpad ou Spotlight; para fixar, arraste para o Dock. Log em
  `~/Library/Application Support/ManagerFinance/logs/app.log`.
- O `.dmg` (`backend/dist/Finora-<versão>.dmg`) é o instalador para outros Macs com
  Apple Silicon (M1 em diante): abrir e arrastar para Aplicativos.
- **Assinatura, fora da App Store.** Sem certificado, o app é assinado ad-hoc: roda no Mac que
  gerou, mas num Mac que baixou o `.dmg` o sistema pede "Abrir mesmo assim" em Ajustes →
  Privacidade e Segurança. Para abrir sem aviso (como Steam ou Discord, baixados de site), crie
  um certificado **Developer ID Application** (Xcode → Ajustes → Contas → Gerenciar
  Certificados → +) e salve uma vez as credenciais de notarização:
  `xcrun notarytool store-credentials finora --apple-id voce@exemplo.com --team-id SEU_TEAM_ID`.
  Daí em diante: `MF_NOTARY_PROFILE=finora scripts/build-desktop.sh`. O script acha o
  certificado sozinho, assina, notariza e grampeia o `.dmg`.

**Nos dois**

- O programa aplica as migrações sozinho, guardando antes `managerfinance.db.bak`.
- O sync automático roda enquanto a janela estiver aberta.
- Mudou o código? Rode o script de novo (com o app fechado).

## 🧭 Como usar

- **Contas → Conectar banco**: abre o widget da Pluggy. Marque "Mostrar bancos de teste"
  para experimentar com o Pluggy Bank (`user-ok` / `password-ok`) antes de conectar
  contas reais. O primeiro sync traz até 12 meses.
- **Sincronização**: automática a cada 6 h enquanto o backend estiver rodando
  (`SYNC_INTERVAL_HOURS`), ou pelo botão "Sincronizar agora".
- **Importar OFX**: para bancos sem Open Finance; reimportar não duplica.
- **Transações**: trocar a categoria pode criar uma regra que vale para as parecidas
  (atuais e futuras).
- **Orçamentos**: limite por categoria, vale do ciclo escolhido em diante.
- **Visão geral**: livre agora, previsão do ciclo, receitas x despesas, reserva de
  emergência, gastos fixos/assinaturas detectados, parcelas futuras e um score de saúde
  financeira (poupança 40 + reserva 30 + gastos fixos 30).
- **Avisos por e-mail** (Perfil › Avisos por e-mail): fim e resumo do ciclo, meio do ciclo,
  fatura vencendo, compra fora da rotina, gasto demais numa área, desejo que cabe no orçamento e
  outros. Saem de uma conta Gmail com senha de app (configurada no Perfil, guardada
  criptografada), a cada 15 minutos enquanto o Finora estiver aberto; silêncio das 22h às 8h.
- **Assistente**: precisa do [Ollama](https://ollama.com) rodando na máquina; detalhes em
  [`docs/assistente-local.md`](docs/assistente-local.md).

### 🧪 Testes e lint

```bash
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
cd frontend && npm run lint && npm run build
```

## 🛡️ Segurança

- 🔑 Login com senha; 2FA (TOTP) opcional com `create_user --totp`; token JWT de curta duração
- 🔐 IDs de conexão da Pluggy criptografados no banco (`FIELD_ENCRYPTION_KEY`)
- 🙈 O segredo da Pluggy nunca sai do backend; clientes recebem só um *connect token* temporário
- 🧠 O assistente só aceita um LLM em endereço local (loopback), mesmo com um `.env` errado
- 💽 Recomendado: BitLocker ativo e manter o projeto **fora do OneDrive**, para o `.env`
  não ser sincronizado com a nuvem

## 🗺️ Roadmap

- [x] Validação da Pluggy (`scripts/pluggy_check.py`)
- [x] Fundação: API, auth, modelo de dados, migrações, frontend com login
- [x] Ingestão: sync periódico (Pluggy v2), deduplicação, importação OFX, categorização por regras
- [x] Dashboards e índices (taxa de poupança, reserva de emergência, comprometimento de renda…)
- [x] Ciclo da fatura, cofrinhos, cartões, lista de desejos e previsão do ciclo
- [x] Assistente local (Ollama): chat com ferramentas e padrões encontrados
- [ ] Sugestões de categoria pelo LLM, com confirmação
- [ ] 📱 App iOS (SwiftUI) usando esta mesma API
