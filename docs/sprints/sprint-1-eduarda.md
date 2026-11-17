# Sprint 1 "Fim do papel" (10/11 a 17/11/2026): entregas da Eduarda

Registro do que foi entregue, do prazo real de cada item, do motivo do atraso entre "pronto" e "no `main`" e dos desafios encontrados. As histórias do Isack (US01, US03, US04, US07) e da Julia (US06) não estão neste relatório.

## Resumo

| Item                                           | Jira                                                         | Código pronto | PR aberto   | No `main`   | PR                                                 |
| ---------------------------------------------- | ------------------------------------------------------------ | ------------- | ----------- | ----------- | -------------------------------------------------- |
| Base do projeto (T1.1)                         | [SEB-20](https://scarioteduarda.atlassian.net/browse/SEB-20) | 10/11 20:39   | 10/11 21:47 | 17/11 19:45 | [#1](https://github.com/IsackAraujo/booker/pull/1) |
| US02 Importar alunos                           | [SEB-7](https://scarioteduarda.atlassian.net/browse/SEB-7)   | 10/11 20:45   | 10/11 21:47 | 17/11 19:48 | [#2](https://github.com/IsackAraujo/booker/pull/2) |
| US05 Registrar devolução                       | [SEB-9](https://scarioteduarda.atlassian.net/browse/SEB-9)   | 10/11 20:52   | 10/11 21:47 | 17/11 19:48 | [#3](https://github.com/IsackAraujo/booker/pull/3) |
| US08 Atrasos e cobrança (Sprint 2, adiantada)  | [SEB-12](https://scarioteduarda.atlassian.net/browse/SEB-12) | 10/11 20:56   | 10/11 21:47 | 17/11 19:49 | [#4](https://github.com/IsackAraujo/booker/pull/4) |
| US10 Reserva para a turma (backlog, adiantada) | [SEB-15](https://scarioteduarda.atlassian.net/browse/SEB-15) | 10/11 21:02   | 10/11 21:47 | 17/11 19:49 | [#5](https://github.com/IsackAraujo/booker/pull/5) |
| US13 Painel (backlog, adiantada)               | [SEB-18](https://scarioteduarda.atlassian.net/browse/SEB-18) | 10/11 21:10   | 10/11 21:47 | 17/11 19:50 | [#6](https://github.com/IsackAraujo/booker/pull/6) |

Horários de Brasília. Ao final: 196 testes automatizados e 12 testes E2E, CI verde no `main` (commit `df0f7f7`).

## Por que levou uma semana entre "pronto" e "no `main`"

O código de todas as histórias ficou pronto e testado localmente no dia 10/11. Os 7 dias até o merge foram de **infraestrutura de entrega**, não de desenvolvimento:

1. **10/11: os PRs não puderam ser abertos.** A máquina não tinha o GitHub CLI (`gh`) e o navegador usado não estava logado no GitHub. As branches foram enviadas no mesmo dia, mas os PRs ficaram para a sessão seguinte.
2. **17/11: o GitHub Actions não rodava.** Com os PRs abertos, nenhuma execução de CI era criada. Isso continuou depois de ativar as permissões de Actions, de fechar e reabrir o PR e de enviar um commit novo. O problema foi destravado depois de abrir um PR do `ci.yml` para o `main` (PR #7, já fechado), mas não dá para afirmar qual das mudanças resolveu.
3. **17/11: o CI encontrou uma falha real no PR #1.** A branch da base, sozinha, tinha 47,5% de cobertura, e a meta é 80%. Os arquivos `session.ts`, `settings.ts` e `errors.ts` só eram testados pelas histórias seguintes. Foram criados 8 testes (cobertura de 98%) e a correção foi levada para as 5 branches seguintes.
4. **17/11: o PR #2 foi fechado por engano.** A branch do PR #1 foi apagada logo depois do merge, antes de mudar a base do PR #2 para o `main`, e o GitHub fecha o PR que perde a branch de base. A branch foi recriada, o PR reaberto e a base trocada. Os merges seguintes foram feitos trocando a base antes de apagar a branch.

**Ponto de atenção no Jira:** as tasks foram movidas para **Feito** em 10/11, quando o código estava pronto e testado localmente, mas antes do merge. O correto é mover para Feito depois do merge com CI verde. O código só passou a estar de fato no `main` em 17/11.

## Desafios por entrega

### Base do projeto (SEB-20)

- **Sem Docker nas máquinas do time.** Foi adotado o PGlite (PostgreSQL embarcado) em desenvolvimento e testes, para não depender de instalar um banco (ADR 2).
- **Conflito de dependências no `npm install`.** O `exceljs` puxa uma versão antiga de `@types/node`, que conflita com o Vitest. Resolvido com `overrides` no `package.json`.
- **Next.js 16 e React 19 são versões recentes,** com mudanças de API. Cada tela foi verificada no navegador e pelo E2E.
- **Login ainda não existe** (T3.1, Isack). Foi criada uma sessão de desenvolvimento, desligada em produção, para as telas funcionarem (ADR 5).

### US02 Importar alunos (SEB-7)

- **Formatos de planilha.** O Excel em português exporta CSV com `;`, BOM e aspas, e o `.xlsx` traz matrícula e telefone como número. O leitor trata os dois formatos.
- **Regra do telefone não estava definida.** Ficou decidido aceitar só celular, porque o contato é por WhatsApp. Precisa ser confirmado com a secretaria.
- **O React 19 limpava o formulário quando havia erro,** e a bibliotecária perderia o que digitou. Corrigido para manter os valores.

### US05 Registrar devolução (SEB-9)

- **A US04 (registrar empréstimo) ainda não existe.** Os testes criam os empréstimos direto no banco, e a devolução só funciona de ponta a ponta quando a US04 entrar.
- **Atraso calculado no fuso da escola.** Devolver às 23h50 do dia do prazo não pode contar como atraso, e o servidor roda em UTC. Coberto por testes de borda (no dia, um dia depois, virada de mês e de ano).
- **Banco duplicado no Next.** Páginas e ações do servidor carregavam cópias diferentes da conexão e enxergavam bancos diferentes. Corrigido guardando a conexão em `globalThis` (ADR 6).

### US08 Atrasos e cobrança (SEB-12)

- **O envio real por WhatsApp é a T7.1 do Isack.** Foi criada uma interface de envio com uma versão falsa para testes. Até a T7.1 entrar, a tentativa fica registrada como falha, sem enviar nada.
- **Testes E2E em paralelo no mesmo banco.** A devolução de um teste tirava o atraso que outro teste esperava. Cada teste passou a ter dados próprios.

### US10 Reserva para a turma (SEB-15)

- **Regra de disponibilidade.** Não estava definido se um livro atrasado conta como disponível na data da atividade. Ficou decidido que não conta. Precisa ser confirmado com a Genilse e a Roseli.
- **Testes com o perfil de professora,** sem login. Foi criada a troca de perfil por cookie, só em desenvolvimento.

### US13 Painel (SEB-18)

- **Os critérios não dizem como o período afeta cada total.** As definições escolhidas estão na tela e na ADR 7. Precisam ser confirmadas com a Mariana.
- **Cobertura com testes em paralelo** estourava o tempo-limite na criação do banco de teste. O tempo-limite foi aumentado.

## Pendências

- Confirmar com a secretaria, a Roseli, a Genilse e a Mariana as decisões marcadas acima.
- US01 e US04 (Isack) fecham a meta da Sprint 1. A US05 depende da US04 para funcionar de ponta a ponta.
- T3.1 (login) e T7.1 (WhatsApp), do Isack, substituem a sessão de desenvolvimento e o envio falso.
