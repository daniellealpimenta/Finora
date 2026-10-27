"""Avisos por e-mail (docs no artifact "Avisos por e-mail do Finora" e em MASTER.md).

- `settings`: conta de envio (no Perfil, senha criptografada) e preferências.
- `mailer`: envio pelo SMTP (Gmail com senha de app).
- `render`: o e-mail em HTML e em texto, a partir de blocos.
- `rules`: o que está para sair agora; o código decide, nunca o modelo.
- `comment`: o parágrafo do mascote, escrito pelo LLM local e conferido contra os números.
- `outbox`: junta tudo; roda no agendador, a cada 15 minutos.
"""
