---
name: pronto
description: Confere a definição de pronto do TESTING.md §8 para a task atual antes de commitar, abrir PR ou mover para Feito no Jira. Use quando o usuário digitar /pronto, perguntar se a task está pronta, ou antes de mover uma task SEB para Feito.
argument-hint: SEB-NN (opcional; padrão = a task da branch atual)
---

# /pronto — definição de pronto

Argumento: `$ARGUMENTS`

1. **Identificar a task:** use o argumento ou extraia `SEB-NN` do nome da branch atual (`git branch --show-current`). Leia a task e a história mãe no Jira (cloudId `5c62a942-90a3-435f-bd41-543c8b67a191`) para ter os critérios de aceite.
2. **Ver a mudança:** `git diff main...HEAD --stat` e `git status` (inclua o que ainda não foi commitado).
3. **Conferir cada item, com evidência — não presuma:**

| Item | Como verificar |
|---|---|
| Critérios tocados têm teste `[USnn-CAm]` | grep pelo ID nos testes; cada critério da task aparece |
| Bordas de data e permissão cobertas | ler os testes novos (TESTING.md §4) |
| Escritas verificam `audit_log` | grep `audit` nos testes de service/actions alterados |
| Regras sem `new Date()` e sem valores fixos de prazo/limite | grep `new Date(` e números mágicos em `src/modules/**/rules.ts` e `service.ts` do diff |
| Server Actions novas com `requireRole` | grep nas `actions.ts` alteradas |
| Schema mudou → migração gerada e commitada | diff em `src/db/schema.ts` implica arquivo novo em `src/db/migrations/` |
| `npm run check` passa | rodar e mostrar o resumo |
| E2E atualizado se mudou tela | diff em `src/app/` implica `tests/e2e/` rodado com `npm run test:e2e` |
| Sem `.only`, `.skip`, `console.log`, `TODO` novo sem task | grep no diff |
| ARCHITECTURE.md atualizado se a arquitetura mudou | diff de modelo, pastas, dependências ou integrações sem diff no doc = pendente |

4. **Relatar** uma tabela `item | ✔/✘ | evidência` e, se tudo estiver ✔, dizer que a task pode ir para Feito — **sem mover**; mover para Feito, push e PR dependem de confirmação do usuário (ver `/task` passo 6). Se houver ✘, liste o que falta fazer, em ordem.
