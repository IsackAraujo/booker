---
name: testes
description: Monta a matriz critério de aceite → teste de uma história do Jira (SEB) e escreve os testes que faltam, seguindo o TESTING.md. Use quando o usuário digitar /testes SEB-NN ou USnn, pedir para testar uma história, ver a cobertura dos critérios ou escrever testes de uma funcionalidade.
argument-hint: SEB-NN ou USnn
---

# /testes — critérios de aceite viram testes

Jira: cloudId `5c62a942-90a3-435f-bd41-543c8b67a191`, projeto `SEB`.
Argumento: `$ARGUMENTS`

## 1. Achar a história
- `SEB-NN` de subtarefa → suba para a história mãe. `USnn` → busque com JQL `project = SEB AND issuetype = Story AND summary ~ "USnn"`.
- Leia a descrição (critérios de aceite) com `getJiraIssue`, view `evidence`.
- Leia `TESTING.md` e as seções do `ARCHITECTURE.md` do módulo e das regras dessa história.

## 2. Levantar o que já existe
- Numere os critérios na ordem do Jira: `USnn-CA1`, `USnn-CA2`…
- `grep` por `[USnn-` em `src/` e `tests/` para achar testes existentes.
- Monte a matriz e mostre ao usuário:

| ID | Critério | Camada | Teste | Situação |
|---|---|---|---|---|
| US05-CA3 | Devolução após prazo é atraso | unitário | `isLate…` | ✔ existe / ✘ falta / ⚠ fraco |

"Fraco" = teste que não verificaria a regra se ela quebrasse (sem assert do resultado, sem borda de data, só caminho feliz).

## 3. Acrescentar os casos obrigatórios (TESTING.md §4)
Para cada critério, considere e inclua na matriz quando se aplicar:
- **Datas:** no dia do prazo, um dia depois, fim de semana, virada de mês/ano — sempre com `fixedClock`.
- **Permissão:** acesso negado para cada perfil não previsto + sem sessão.
- **Auditoria:** operação grava `audit_log`; falha não grava.
- **Banco:** a constraint correspondente (único, parcial) rejeita o caso proibido mesmo sem passar pela regra.
- **Rotinas:** seleção certa, exclusões (ex.: já devolvido), idempotência, falha de envio registrada.
- **E2E:** um caminho feliz da história; projeto `mobile` se a história é de celular (US09, US10, US11).

## 4. Escrever os testes que faltam
- Camada mais baixa possível. Factories de `tests/factories/` (crie a factory se faltar). `createTestDb()` por teste. `FakeMessageSender` para WhatsApp. Nada de rede, nada de data real.
- Nome: `[USnn-CAm] <regra em português>`.
- Rode cada teste novo. Se a funcionalidade **ainda não existe**, o teste deve falhar pelo motivo certo — avise o usuário e não "conserte" o teste para passar.
- Se o teste revela um **bug** no código existente, não corrija em silêncio: mostre o caso ao usuário e proponha a correção (TESTING.md §6).

## 5. Relatar
- Matriz final com a situação de cada critério.
- Saída de `npx vitest run -t "USnn"` (e do E2E, se rodou).
- Critérios ambíguos que precisam de resposta do time.
