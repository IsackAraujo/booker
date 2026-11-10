---
name: task
description: Pega uma task do Jira (projeto SEB) e leva do início ao fim — lê a task e a história mãe, move para Fazendo, cria a branch, escreve os testes a partir dos critérios de aceite, implementa, commita e comenta no Jira. Use quando o usuário digitar /task SEB-NN ou pedir para trabalhar numa task/história do Jira.
argument-hint: SEB-NN (ou vazio para sugerir a próxima)
---

# /task — fluxo de uma task do Jira

Jira: cloudId `5c62a942-90a3-435f-bd41-543c8b67a191`, projeto `SEB`.
Transições: `A fazer` = 11, `Fazendo` = 21, `Feito` = 31.

Argumento recebido: `$ARGUMENTS`

## 1. Escolher a task
- Se veio uma chave (ex.: `SEB-20`), use-a.
- Se veio vazio, busque com JQL `project = SEB AND status = "A fazer" AND issuetype = Subtask ORDER BY key ASC` e sugira a próxima respeitando dependências: T1.1 antes de tudo; cadastro (E01) antes de empréstimo (E02); empréstimo antes de devolução, avisos (E03) e reservas (E04); relatórios (E05) por último. Confirme com o usuário antes de seguir.

## 2. Entender
- Leia a task com `getJiraIssue` (view `evidence`) e a **história mãe** — os critérios de aceite estão na descrição da história. Leia também o épico para contexto.
- Leia `CLAUDE.md`, `ARCHITECTURE.md` (seções do módulo afetado, modelo de dados, regras, perfis) e `TESTING.md`.
- Leia o código existente que a task toca.
- Se a task é a T1.1 (SEB-20), ela inclui criar o esqueleto do projeto conforme ARCHITECTURE.md §2–§3 e TESTING.md §2 (scripts npm, Vitest, Playwright, PGlite, `createTestDb`, factories, CI) — além do schema.
- Critério ambíguo ou valor de negócio não definido → pergunte ao usuário. Não invente.

## 3. Começar
- Mova a task para **Fazendo** (`transitionJiraIssue`, transitionId `21`). Se a história mãe estiver em `A fazer`, mova ela também.
- A partir de `main` atualizada, crie a branch `SEB-NN-descricao-curta`.

## 4. Planejar os testes (antes do código)
- Monte a matriz da TESTING.md §3 só com os critérios que **esta task** toca: `ID | critério | camada | nome do teste`.
- Inclua os casos obrigatórios da TESTING.md §4 que se aplicam: bordas de data, acesso negado por perfil e sem sessão, auditoria, idempotência de rotina.
- Mostre a matriz ao usuário em poucas linhas e siga.

## 5. Implementar em ciclos curtos
1. Escreva o teste (com `[USnn-CAm]` no nome) e rode — ele deve **falhar pelo motivo certo**.
2. Implemente o mínimo para passar, respeitando a anatomia do módulo (`rules` puro → `service` com transação + audit → `actions` com `requireRole` + Zod).
3. Rode de novo; refatore com os testes verdes.
4. Repita até cobrir a matriz. Mudou o fluxo na tela → atualize o E2E da história.
- Ao final rode `npm run check` (e `npm run test:e2e` se mexeu em tela). Não avance com falha.

## 6. Fechar
- Rode a checagem da skill `/pronto`.
- Commit com mensagem `SEB-NN: <resumo em português>`.
- Comente na task do Jira (`addOrEditJiraIssueComment`): o que foi feito, a matriz critério → teste, branch, como testar manualmente, pendências ou decisões tomadas com o usuário.
- **Pergunte ao usuário** antes de: dar push, abrir PR e mover a task para **Feito** (transitionId `31`). Só mova para Feito com o check passando.
- Se todas as subtarefas da história estiverem em Feito, sugira mover a história também.
