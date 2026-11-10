# Testes — Booker

Como o time (e o Claude) testa o sistema. Arquitetura e regras de negócio: [ARCHITECTURE.md](ARCHITECTURE.md).

**Princípio:** todo critério de aceite do Jira vira pelo menos um teste automatizado. Uma task só vai para `Feito` com os testes dela escritos e passando no CI.

---

## 1. Pirâmide

| Camada | Ferramenta | O que testa | Onde fica | Velocidade |
|---|---|---|---|---|
| **Unitário** | Vitest | funções puras de `rules.ts`: prazos, limites, atrasos, disponibilidade, normalização de telefone, validação de planilha | ao lado do código: `rules.test.ts` | ms |
| **Integração** | Vitest + PGlite | `service.ts` com banco real: transações, constraints, auditoria, Server Actions com perfil | ao lado: `service.test.ts`, `actions.test.ts` | dezenas de ms |
| **Componente** | Vitest + Testing Library | só componentes com lógica própria (busca do balcão, formulário de importação) | ao lado: `*.test.tsx` | ms |
| **E2E** | Playwright | o caminho feliz de cada história + permissões, no navegador, desktop e celular | `tests/e2e/usNN-*.spec.ts` | segundos |

Proporção esperada: muitas regras unitárias, integração para tudo que grava no banco, **um ou dois** E2E por história. Não duplicar no E2E o que já está coberto embaixo.

## 2. Comandos

```bash
npm test                 # unitários + integração + componentes (Vitest)
npm run test:watch       # modo watch durante o desenvolvimento
npm run test:coverage    # com relatório de cobertura em coverage/
npm run test:e2e         # Playwright (sobe o app com banco PGlite de teste)
npm run test:e2e -- --ui # Playwright com interface para depurar
npm run check            # lint + typecheck + npm test  (o mesmo que o CI roda)
```

## 3. Critério de aceite → teste

Cada critério recebe um identificador `USnn-CAm` (história + número do critério na ordem do Jira). O identificador vai **no nome do teste**, para rastrear pelo `grep`.

Exemplo, US04 Registrar empréstimo:

| ID | Critério (Jira) | Camada | Teste |
|---|---|---|---|
| US04-CA1 | Não registra sem aluno e exemplar | integração | `registerLoan rejeita sem aluno ou exemplar` |
| US04-CA2 | Indica data de devolução conforme prazo da escola | unitário | `dueDate soma loan_days e pula fim de semana` |
| US04-CA3 | Avisa aluno em atraso ou no limite | unitário + integração | `canBorrow sinaliza atraso`, `canBorrow bloqueia no limite` |
| US04-CA4 | Exemplar emprestado não é emprestado de novo | integração | `segundo empréstimo do mesmo exemplar falha` (testa também o índice único) |
| — | caminho feliz no balcão | E2E | `us04-emprestimo.spec.ts` |

```ts
describe('US04 Registrar empréstimo', () => {
  it('[US04-CA4] não empresta exemplar com empréstimo aberto', async () => { ... })
})
```

Para ver a cobertura de uma história: `npx vitest run -t "US04"`.

Quando o critério é ambíguo (ex.: "avisar" vs. "bloquear"), **não invente**: pergunte, registre a resposta no comentário da task no Jira e só então escreva o teste.

## 4. Como escrever

### Estrutura
- **Arrange / Act / Assert**, separados por linha em branco.
- Um comportamento por `it`. Nome em português, descrevendo a regra, não a implementação.
- Teste o resultado observável (retorno, linha no banco, mensagem enviada), não chamadas internas.

### Datas — sempre relógio fixo
Nunca dependa da data real. Serviços recebem `clock`:

```ts
const clock = fixedClock('2026-03-10') // terça-feira
const loan = await registerLoan(db, clock, { studentId, copyId, userId })
expect(loan.dueDate).toBe('2026-03-24')
```

Casos de data obrigatórios quando a regra envolve prazo: vencimento em dia útil, vencimento caindo no fim de semana, devolução **no** dia do prazo (não é atraso), devolução um dia depois (é atraso), virada de mês e de ano.

### Banco — PGlite limpo por teste
```ts
import { createTestDb } from '@/tests/support/db'

let db: TestDb
beforeEach(async () => { db = await createTestDb() }) // aplica as migrações, banco vazio
```
- Usa as **mesmas migrações** da produção: se a migração quebrar, o teste quebra.
- Nada de dados compartilhados entre testes. Nada de depender da ordem de execução.

### Dados — factories
Em `tests/factories/`, com padrões válidos e só o necessário sobrescrito:

```ts
const student = await makeStudent(db, { className: '5A' })
const copy = await makeCopy(db) // cria o livro junto se não for passado
await makeLoan(db, { student, copy, dueDate: '2026-03-01' }) // empréstimo atrasado
```

Factories existentes (ampliar conforme as tasks): `makeUser`, `makeBook`, `makeCopy`, `makeStudent`, `makeLoan`, `makeClassReservation`, `makeHold`, `makeSettings`.

### Integrações externas — fakes, nunca rede
- WhatsApp: `FakeMessageSender` — `sender.sent` lista as mensagens; `sender.failNext('motivo')` simula falha.
- Nenhum teste faz chamada HTTP real. Se precisar, é sinal de que falta uma interface.

### Permissões
Toda Server Action tem teste de **acesso negado** para cada perfil que não deveria usá-la (tabela em [ARCHITECTURE.md §6](ARCHITECTURE.md#6-autenticação-e-autorização)), e de **sem sessão**:

```ts
it.each(['professor', 'coordenacao'] as const)('[US03-CA2] %s não registra empréstimo', async (role) => {
  await expect(asUser(role, () => registerLoanAction(input))).rejects.toThrow(ForbiddenError)
})
```

### Auditoria
Toda operação que grava dados tem teste verificando a linha em `audit_log` (quem, o quê, quando) e que **falha da operação não gera log**.

### Rotinas (cron)
Testar: seleciona os registros certos, ignora os que não devem (ex.: já devolvido), **idempotência** (rodar duas vezes não envia em dobro) e falha de envio registrada.

### E2E
- Um arquivo por história: `tests/e2e/us09-consulta-acervo.spec.ts`.
- Usar seletores por papel e texto (`getByRole('button', { name: 'Registrar empréstimo' })`), nunca classes CSS.
- Histórias de celular (US09, US10, US11) rodam também no projeto Playwright `mobile` (viewport de celular).
- Login por helper `loginAs('bibliotecaria')`, que usa usuários do seed de teste.

## 5. Cobertura

| Escopo | Mínimo |
|---|---|
| `src/modules/**/rules.ts` | 95% de linhas e branches |
| `src/modules/**/service.ts` e `actions.ts` | 85% |
| Geral | 80% |

Configurado em `vitest.config.ts` (`coverage.thresholds`); o CI falha abaixo disso. Cobertura é piso, não meta: o que vale é cada critério de aceite ter teste.

## 6. Bugs

Bug encontrado → primeiro um teste que **reproduz** e falha, depois a correção. O teste fica para sempre com o nome do bug: `[SEB-NN] devolução no mesmo dia não conta como atraso`.

## 7. CI

`.github/workflows/ci.yml` em todo push e PR:
1. `npm ci`
2. `npm run lint` e `npm run typecheck`
3. `npm run test:coverage`
4. `npx playwright install --with-deps chromium` e `npm run test:e2e`

PR só é mergeado com o CI verde.

## 8. Definição de pronto (checklist da task)

- [ ] Todos os critérios de aceite da história tocados pela task têm teste com `[USnn-CAm]` no nome
- [ ] Casos de borda de data e de permissão cobertos quando se aplicam
- [ ] Operações que gravam dados verificam o `audit_log`
- [ ] `npm run check` passa localmente
- [ ] E2E da história atualizado se a task muda o fluxo na tela
- [ ] Nenhum `it.skip`, `it.only` ou `console.log` esquecido
- [ ] Comentário no Jira com o que foi testado
