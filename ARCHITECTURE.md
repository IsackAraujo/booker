# Arquitetura — Booker

Este documento é a referência técnica do sistema. Toda decisão que mudar algo aqui deve atualizar o documento no mesmo PR, com uma entrada nova em [Decisões](#10-decisões-adr).

Estratégia de testes: [TESTING.md](TESTING.md). Regras de trabalho do time e do Claude: [CLAUDE.md](CLAUDE.md).

---

## 1. Visão geral

Aplicação web única (monólito) usada por quatro públicos:

| Perfil | Quem | Onde usa | O que faz |
|---|---|---|---|
| `bibliotecaria` | Roseli | computador do balcão | cadastro, empréstimo, devolução, cobrança, histórico, painel |
| `professor` | Genilse | celular | consulta ao acervo, reserva para turma, acompanhamento da turma |
| `coordenacao` | Mariana | computador ou celular | painel e relatórios |
| aluno (sem login) | Raissa | WhatsApp | recebe lembretes e avisos; a fila de reserva é registrada pela bibliotecária |

> O aluno **não tem login** no MVP. A reserva da fila (US12) é registrada no balcão pela bibliotecária e o aluno é avisado pelo WhatsApp. Se o time decidir dar acesso ao aluno, registrar como nova ADR.

```
 Navegador (desktop / celular)
          │  HTTPS
 ┌────────▼──────────────────────────────────────────┐
 │  Next.js (App Router)                             │
 │  ├─ páginas (React Server Components + Tailwind)  │
 │  ├─ Server Actions / Route Handlers  ──► Zod      │
 │  ├─ módulos de domínio (regras puras)             │
 │  └─ serviços (casos de uso + transações)          │
 └────────┬───────────────────────┬──────────────────┘
          │ Drizzle ORM           │ interface MessageSender
 ┌────────▼────────┐     ┌────────▼────────────────────┐
 │  PostgreSQL     │     │  WhatsApp Business Cloud API │
 └─────────────────┘     └─────────────────────────────┘
          ▲
          │ HTTP com segredo (CRON_SECRET), 1x por dia
 ┌────────┴─────────┐
 │  Agendador (cron) │  → /api/cron/lembretes e /api/cron/reservas
 └──────────────────┘
```

## 2. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | **TypeScript** (strict) em tudo | um só idioma de front a back; tipos pegam erro de regra cedo |
| Runtime | **Node.js LTS** (≥ 22) | já instalado nas máquinas do time |
| Framework web | **Next.js (App Router)** | front e back no mesmo projeto, Server Actions eliminam API manual, deploy simples |
| UI | **Tailwind CSS + shadcn/ui** | responsivo de fábrica (US09 exige celular), componentes acessíveis |
| Banco | **PostgreSQL** | relacional, transações e constraints garantem regras como "exemplar não pode ser emprestado duas vezes" |
| ORM / migrações | **Drizzle ORM + drizzle-kit** | schema em TypeScript, SQL previsível, roda também sobre PGlite nos testes |
| Banco em teste/dev local | **PGlite** (Postgres em WASM, in-process) | Postgres de verdade sem Docker; cada teste ganha um banco limpo em milissegundos |
| Validação | **Zod** | mesmo schema valida formulário, Server Action e planilha importada |
| Autenticação | **Auth.js** (Credentials: e-mail + senha com hash bcrypt) | sessão por cookie, perfis no token; sem dependência de Google/Microsoft da escola |
| Planilha | **ExcelJS** (`.xlsx`) + parser CSV | importação de alunos (US02) e exportação de relatório (US14) |
| Datas | **date-fns** + `date-fns-tz`, fuso `America/Sao_Paulo` | prazos são datas de calendário escolar, não instantes |
| Mensageria | **WhatsApp Business Cloud API** atrás de `MessageSender` | trocável; em teste usa `FakeMessageSender` |
| Testes | **Vitest**, **Testing Library**, **Playwright** | ver [TESTING.md](TESTING.md) |
| Qualidade | **ESLint**, **Prettier**, `tsc --noEmit` | rodam no CI e antes de cada commit |
| CI | **GitHub Actions** | lint + typecheck + testes em todo PR |
| Hospedagem (sugestão) | Vercel (app + cron) + Neon (Postgres gerenciado) | plano gratuito atende uma escola; trocar não afeta o código |

## 3. Estrutura de pastas

```
booker/
├─ src/
│  ├─ app/                         # rotas Next.js (somente UI e cola)
│  │  ├─ (auth)/login/
│  │  ├─ (app)/acervo/             # US01, US09
│  │  ├─ (app)/alunos/             # US02, US06
│  │  ├─ (app)/balcao/             # US04, US05
│  │  ├─ (app)/atrasos/            # US08
│  │  ├─ (app)/reservas/           # US10, US12
│  │  ├─ (app)/minha-turma/        # US11
│  │  ├─ (app)/painel/             # US13
│  │  ├─ (app)/relatorios/         # US14
│  │  ├─ (app)/historico/          # US03
│  │  └─ api/cron/                 # rotinas diárias (US07, US12)
│  ├─ modules/                     # um módulo por área de negócio
│  │  ├─ catalog/                  # livros e exemplares
│  │  ├─ students/                 # alunos, importação, transferência
│  │  ├─ loans/                    # empréstimo, devolução, atrasos
│  │  ├─ reservations/             # reserva de turma e fila do aluno
│  │  ├─ notifications/            # lembretes, cobranças, MessageSender
│  │  ├─ reports/                  # painel e relatórios
│  │  └─ audit/                    # log de operações
│  ├─ db/
│  │  ├─ schema.ts                 # tabelas Drizzle (fonte única do modelo)
│  │  ├─ client.ts                 # conexão (Postgres ou PGlite)
│  │  └─ migrations/               # geradas pelo drizzle-kit, nunca editar à mão
│  ├─ lib/                         # auth, clock, settings, utilitários
│  └─ components/                  # componentes de UI compartilhados
├─ tests/
│  ├─ e2e/                         # Playwright, um arquivo por história
│  ├─ factories/                   # construtores de dados de teste
│  └─ support/                     # banco de teste, fakes, helpers
├─ ARCHITECTURE.md · TESTING.md · CLAUDE.md
└─ .github/workflows/ci.yml
```

### Anatomia de um módulo

```
src/modules/loans/
├─ rules.ts            # funções PURAS: dueDate(), canBorrow(), daysLate()…  (sem banco, sem data do sistema)
├─ rules.test.ts       # testes unitários das regras
├─ service.ts          # casos de uso: registerLoan(), registerReturn()… abre transação, chama rules, grava audit
├─ service.test.ts     # testes de integração com PGlite
├─ schemas.ts          # Zod de entrada/saída
├─ actions.ts          # Server Actions: checa sessão e perfil, valida com Zod, chama service
└─ queries.ts          # leituras para telas (listas, buscas)
```

**Regra de dependência:** `app → actions → service → rules`. `rules` não importa nada de banco, Next ou data atual. `service` recebe `db` e `clock` por parâmetro (injeção simples), o que torna tudo testável.

## 4. Modelo de dados

Nomes de tabela e coluna em inglês (`snake_case`); valores de enum em português porque aparecem na interface.

```
users ─────────────┐ (created_by / returned_by / user_id)
                   ▼
books 1───N copies 1───N loans N───1 students
  │                        │  └──N───1 users (teacher_id, opcional)
  │                        └──1───N notifications
  ├──1───N class_reservations N───1 users (professor)
  └──1───N hold_queue N───1 students
audit_log (append-only)        settings (linha única)
```

| Tabela | Campos principais | Regras garantidas no banco |
|---|---|---|
| `users` | id, name, email, password_hash, role (`bibliotecaria`/`professor`/`coordenacao`), active | email único |
| `books` | id, title, author, category, age_range, active | title/author/category/age_range NOT NULL (US01) |
| `copies` | id, book_id, code, status (`disponivel`/`emprestado`/`separado`/`perdido`/`danificado`) | `code` UNIQUE (US01) |
| `students` | id, registration (matrícula), name, class_name, guardian_phone, status (`ativo`/`transferido`), transferred_at | `registration` UNIQUE → upsert na importação (US02) |
| `loans` | id, copy_id, student_id, teacher_id?, loaned_at, due_date, returned_at?, return_condition? (`ok`/`perdido`/`danificado`), returned_late, created_by, returned_by? | índice único parcial `copy_id WHERE returned_at IS NULL` — um exemplar só tem um empréstimo aberto (US04) |
| `class_reservations` | id, teacher_id, book_id, class_name, quantity, activity_date, status (`ativa`/`cancelada`/`atendida`) | quantity > 0 |
| `hold_queue` | id, book_id, student_id, created_at, status (`aguardando`/`avisado`/`expirada`/`atendida`/`cancelada`), copy_id?, notified_at?, hold_until? | único parcial `(book_id, student_id) WHERE status IN ('aguardando','avisado')` (US12) |
| `notifications` | id, kind (`lembrete`/`cobranca`/`reserva_disponivel`), loan_id?, hold_id?, phone, body, status (`enviado`/`falhou`), error?, created_at, created_by? | único parcial `(loan_id) WHERE kind='lembrete'` — lembrete uma única vez (US07) |
| `audit_log` | id, user_id, action, entity, entity_id, payload (jsonb), created_at | só INSERT; a aplicação não expõe update/delete (US03) |
| `settings` | loan_days, max_active_loans, block_when_overdue, hold_pickup_days, reminder_days_before | linha única, editável pela bibliotecária |

Exemplar emprestado **não** é derivado só do status: a verdade é "existe empréstimo aberto". `copies.status` é atualizado na mesma transação e serve para buscas rápidas.

## 5. Regras de negócio e onde vivem

Toda regra abaixo tem função em `rules.ts` **e** teste com o identificador do critério (ver [TESTING.md](TESTING.md#3-critério-de-aceite--teste)).

| Regra | Origem | Onde |
|---|---|---|
| Data de devolução = data do empréstimo + `loan_days` (dias corridos; se cair em sábado/domingo, vai para segunda) | US04 | `loans/rules.dueDate` |
| Aluno com `max_active_loans` empréstimos abertos não pega outro | US04, T4.3 | `loans/rules.canBorrow` |
| Aluno com empréstimo atrasado: aviso; bloqueia se `block_when_overdue` | US04, T4.3 | `loans/rules.canBorrow` |
| Aluno transferido não pega empréstimo | US06 | `loans/rules.canBorrow` |
| Exemplar só é emprestado se não tem empréstimo aberto e está `disponivel` (ou `separado` para quem o reservou) | US04, US12 | `loans/rules` + índice único |
| Devolução após `due_date` → `returned_late = true` | US05 | `loans/rules.isLate` |
| Livro com histórico de empréstimo não é excluído, só inativado | US01 | `catalog/service.removeBook` |
| Lembrete em `due_date - reminder_days_before`, só para empréstimo aberto, uma vez | US07 | `notifications/rules` + índice único |
| Reserva de turma ≤ exemplares disponíveis na data (descontando outras reservas do dia) | US10 | `reservations/rules.availableOn` |
| Fila: só entra se título sem exemplar disponível; sem duplicidade; na devolução avisa só o 1º; expira após `hold_pickup_days` e passa ao próximo | US12 | `reservations/rules` + cron |
| Histórico não pode ser alterado | US03 | `audit` só tem `append()` |

**Valores padrão a confirmar com a Roseli** (ficam em `settings`, não no código): `loan_days = 14`, `max_active_loans = 2`, `block_when_overdue = true`, `hold_pickup_days = 2`, `reminder_days_before = 3`.

## 6. Autenticação e autorização

- Login por e-mail e senha (Auth.js Credentials). Senha com bcrypt. Sessão em cookie `httpOnly`.
- Middleware do Next bloqueia qualquer rota de `(app)` sem sessão (US03: "nenhuma funcionalidade sem identificação").
- Autorização **no servidor**, em toda Server Action, com `requireRole(...)`. Esconder botão na tela não é autorização.

| Função | bibliotecaria | professor | coordenacao |
|---|:-:|:-:|:-:|
| Cadastro de livros, exemplares, alunos, importação | ✔ | | |
| Empréstimo, devolução, perdido/danificado | ✔ | | |
| Lista de atrasos e cobrança | ✔ | | |
| Consultar acervo | ✔ | ✔ | ✔ |
| Reserva para turma / minha turma | ✔ (vê) | ✔ | |
| Fila de reserva do aluno | ✔ | | |
| Painel | ✔ | | ✔ |
| Relatório de mais procurados | ✔ | | ✔ |
| Histórico de operações | ✔ | | ✔ |
| Configurações e usuários | ✔ | | |

## 7. Auditoria

`audit.append(tx, { userId, action, entity, entityId, payload })` é chamado **dentro da mesma transação** de toda operação que altera dados (empréstimo, devolução, cadastro, importação, transferência, envio de cobrança). Se a operação falhar, o log não é gravado; se o log falhar, a operação é desfeita.

## 8. Integrações e rotinas

### WhatsApp
```ts
interface MessageSender {
  send(to: string, body: string): Promise<{ ok: true; id: string } | { ok: false; error: string }>
}
```
- `WhatsAppCloudSender` (produção) usa a Cloud API com template aprovado pela Meta.
- `FakeMessageSender` (testes e dev) guarda as mensagens em memória e pode simular falha.
- Escolhido por variável de ambiente `MESSAGE_SENDER=whatsapp|fake`.
- Telefone sempre normalizado para E.164 (`+55DDDNÚMERO`) na importação.
- Toda tentativa vira linha em `notifications`; falhas aparecem para a bibliotecária (US07).

### Rotinas diárias
| Rota | Horário sugerido | Faz |
|---|---|---|
| `POST /api/cron/lembretes` | 08:00 | envia lembretes de empréstimos que vencem em `reminder_days_before` dias (US07) |
| `POST /api/cron/reservas` | 07:00 | expira separações vencidas e avisa o próximo da fila (US12) |

Protegidas por `Authorization: Bearer $CRON_SECRET`. São **idempotentes**: rodar duas vezes no mesmo dia não envia nada em dobro.

### Relógio
Nenhum código de negócio chama `new Date()` direto. Use `clock.today()` / `clock.now()` de `src/lib/clock.ts`; em teste injeta-se `fixedClock('2026-03-10')`.

## 9. Configuração

Variáveis em `.env.local` (nunca commitar) e listadas em `.env.example`:

```
DATABASE_URL=            # vazio = PGlite local em ./.pglite
AUTH_SECRET=
CRON_SECRET=
MESSAGE_SENDER=fake      # fake | whatsapp
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
TZ=America/Sao_Paulo
```

## 10. Decisões (ADR)

Formato: data · decisão · motivo · alternativas descartadas.

1. **2026-11-10 · Monólito Next.js + TypeScript.** Time pequeno, um só deploy, front e back juntos. Descartado: API separada (Express/FastAPI) + SPA — dobra o trabalho sem ganho no MVP.
2. **2026-11-10 · PostgreSQL com Drizzle; PGlite em testes e dev.** Constraints do banco reforçam regras críticas; PGlite dá Postgres real sem Docker (as máquinas do time não têm Docker). Descartado: SQLite (diferenças de SQL em relação à produção), Prisma (não roda sobre PGlite de forma estável).
3. **2026-11-10 · Aluno sem login no MVP.** Contato com aluno é via WhatsApp; reduz escopo de autenticação. Revisitar se US12 exigir autoatendimento.
4. **2026-11-10 · Parâmetros da escola em tabela `settings`.** Prazos e limites ainda não confirmados; mudar não exige deploy.
5. **2026-11-10 · Sessão de desenvolvimento até o login existir.** `src/lib/session.ts` tem um provedor trocável; enquanto a T3.1 (SEB-32) não liga o Auth.js, `DEV_SESSION_ROLE` faz o app usar o usuário do seed com aquele perfil. Ignorado quando `NODE_ENV=production`. A T3.1 deve registrar o provedor real com `setSessionProvider` e remover esta ADR.
6. **2026-11-10 · Conexão guardada em `globalThis`.** No Next, páginas e Server Actions podem carregar cópias diferentes de `src/db/client.ts`; com PGlite em memória cada cópia teria um banco próprio.
