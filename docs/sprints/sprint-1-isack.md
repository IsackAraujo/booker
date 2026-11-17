# Sprint 1 "Fim do papel" (10/11 a 17/11/2026): entregas do Isack

Registro do que foi entregue, do prazo real de cada item e dos desafios encontrados. As entregas da Eduarda estão em [sprint-1-eduarda.md](sprint-1-eduarda.md); a US06 é da Julia.

## Resumo

| Item                                            | Jira                                                       | Código pronto | PR aberto   | No `main`   | PR                                                   |
| ----------------------------------------------- | ---------------------------------------------------------- | ------------- | ----------- | ----------- | ---------------------------------------------------- |
| US01 Cadastrar livros e exemplares (T1.2, T1.3) | [SEB-6](https://scarioteduarda.atlassian.net/browse/SEB-6) | 17/11 19:47   | 17/11 20:10 | 17/11 20:15 | [#10](https://github.com/IsackAraujo/booker/pull/10) |
| US04 Registrar empréstimo (T4.1, T4.2, T4.3)    | [SEB-8](https://scarioteduarda.atlassian.net/browse/SEB-8) | 17/11 19:57   | 17/11 20:06 | 17/11 20:15 | [#9](https://github.com/IsackAraujo/booker/pull/9)   |

Horários de Brasília. Com as duas histórias, o `main` ficou com 296 testes automatizados e 16 testes E2E passando.

Com a US01 e a US04, a meta da Sprint 1 ficou completa: a bibliotecária cadastra o acervo e os alunos e registra empréstimos e devoluções no sistema. A US05 (devolução, da Eduarda) agora funciona de ponta a ponta, porque o empréstimo passou a existir.

## Prazo

As duas histórias estavam planejadas para a Sprint 1 (fim em 16/11) e foram entregues no dia 17/11, dia da review. O desenvolvimento começou e terminou em 17/11, então a entrega ficou **um dia depois do fim da sprint**. As tasks só foram movidas para Feito depois de os testes passarem, e o merge aconteceu com o CI verde.

## Desafios por entrega

### US01 Cadastrar livros e exemplares (SEB-6)

- **Código do exemplar único sem diferenciar maiúsculas.** O banco já tinha `code` único, mas "ex-001" e "EX-001" seriam códigos diferentes para ele. Os códigos passaram a ser gravados em maiúsculas e sem espaços, e a busca compara do mesmo jeito que a devolução já fazia.
- **Excluir ou inativar (US01-CA4).** Quem decide é o servidor, pelo histórico do livro, e não a tela. Livro com empréstimo é inativado. **Decisão a confirmar com a Roseli:** livro com reserva de turma ou fila também é só inativado, para não perder a reserva.
- **Página que deixa de existir.** Depois de excluir, a tela do livro recarregava e mostrava "não encontrado". O redirecionamento para a lista passou a ser feito pela própria ação do servidor.

### US04 Registrar empréstimo (SEB-8)

- **Contagem errada de livros por aluno.** Na primeira versão, a consulta que conta os empréstimos abertos e atrasados comparava a coluna errada (o `id` do empréstimo em vez do `id` do aluno), e o limite nunca bloqueava. Os testes de integração pegaram isso antes da tela. As colunas foram escritas com o nome da tabela.
- **Dois balcões ao mesmo tempo.** Além de checar a situação do exemplar, o registro trata o erro do índice único do banco (um empréstimo aberto por exemplar), para o caso de duas pessoas emprestarem o mesmo exemplar no mesmo instante.
- **Data de devolução no fim de semana.** A data segue `loan_days` (padrão 14) e passa para a segunda quando cai no sábado ou no domingo, como está no ARCHITECTURE.md.
- **Aluno transferido.** A regra "transferido não pega empréstimo" é da US06 (Julia), mas fica no código do empréstimo. Ela entrou junto e já está coberta por teste (US06-CA2).
- **Regra de lint do React 19.** O lint recusou limpar a tela dentro de um `useEffect` depois do registro. A limpeza passou para o retorno da própria ação.

### Entrega

- **Branches de base apagadas.** A US01 e a US04 foram feitas em cima da branch do painel (SEB-18). Enquanto isso, os PRs da Eduarda foram mergeados e as branches dela, apagadas. O PR da US01 foi aberto direto para o `main`, e a base do PR da US04 foi trocada para o `main` depois do merge da US01, sem conflitos.

## Pendências

- Confirmar com a Roseli os valores padrão do balcão: prazo de 14 dias, limite de 2 livros e bloqueio por atraso. Eles ficam em `settings` e mudar não exige alteração no código.
- Confirmar com a Roseli que um livro com reserva é só inativado, nunca excluído.
- Sprint 2: T3.1 (login, que substitui a sessão de desenvolvimento), US03 (histórico) e US07 (lembrete no WhatsApp, T7.1, que substitui o envio falso da US08).
