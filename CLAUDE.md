# Booker — Sistema de Empréstimos da Biblioteca

Sistema web para a biblioteca escolar: cadastro de acervo e alunos, empréstimo e devolução no balcão, lembretes por WhatsApp, cobrança de atrasos, reservas e relatórios.

**Leia antes de codar:**
- [ARCHITECTURE.md](ARCHITECTURE.md) — stack, pastas, modelo de dados, regras de negócio, perfis, integrações.
- [TESTING.md](TESTING.md) — como testar, critério de aceite → teste, definição de pronto.

## Equipe
- Isack Costa, Eduarda Scariot, Julia Vitoria Rodrigues
- Personas: Roseli (bibliotecária), Genilse (professora), Mariana (coordenadora), Raissa (aluna)

## Jira (fonte da verdade do backlog)
- Site: `scarioteduarda.atlassian.net` — cloudId `5c62a942-90a3-435f-bd41-543c8b67a191`
- Projeto: **SEB**. Hierarquia: Épico (E01…E05) → História (US01…US14) → Subtarefa (T1.1, T4.2…)
- Status e IDs de transição: `A fazer` (11) → `Fazendo` (21) → `Feito` (31)
- Critérios de aceite ficam na **descrição da história**, não da subtarefa.
- A numeração da task (T4.2) indica a história (US04). **T1.1 (modelo do banco + esqueleto do projeto) vem antes de tudo.**

## Stack (resumo — detalhes em ARCHITECTURE.md)
Next.js (App Router) + TypeScript strict · PostgreSQL + Drizzle (PGlite em testes/dev) · Auth.js · Zod · Tailwind + shadcn/ui · Vitest + Testing Library + Playwright.

## Comandos
> Passam a existir quando a T1.1 criar o esqueleto do projeto.

- Instalar: `npm install`
- Rodar: `npm run dev`
- Banco: `npm run db:generate` (gera migração a partir do schema) · `npm run db:migrate` · `npm run db:seed`
- Testes: `npm test` · `npm run test:e2e` · `npm run test:coverage`
- Tudo que o CI roda: `npm run check`

## Skills do projeto
- `/task SEB-NN` — fluxo completo de uma task do Jira (ler → Fazendo → branch → testes → código → commit → comentário).
- `/testes SEB-NN` — monta a matriz critério de aceite → teste de uma história e escreve os testes que faltam.
- `/pronto` — confere a definição de pronto antes de mover a task para Feito.

## Regras para o Claude
- **Testes primeiro:** antes de implementar, liste os critérios de aceite e os testes que os cobrem (formato de TESTING.md §3). Escreva o teste, veja falhar, implemente.
- Regra de negócio fica em `rules.ts` (puro). Nada de `new Date()` em código de negócio — use `clock`.
- Autorização no servidor em toda Server Action (`requireRole`). Toda escrita grava `audit_log` na mesma transação.
- Parâmetros da escola (prazo, limite, dias de reserva) vêm de `settings`, nunca fixos no código.
- Migrações só via `drizzle-kit generate`; nunca editar migração já commitada.
- Critério ambíguo → pergunte; não invente regra de negócio.
- Mudou algo de arquitetura → atualize ARCHITECTURE.md (com ADR) no mesmo commit.

## Convenções
- Interface, commits e documentação em **português**; código (variáveis, funções, tabelas) em inglês.
- Branch por task: `SEB-NN-descricao-curta`, a partir de `main`.
- Commits começam com a chave: `SEB-20: cria tabelas de livros e exemplares`.
- Não marcar task como `Feito` sem testes passando e critério de aceite atendido.
