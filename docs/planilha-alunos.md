# Planilha de alunos da secretaria (T2.1)

Modelo usado na importação de alunos (US02). Baixe o modelo pronto em **Alunos → Importar planilha → Baixar modelo da planilha** (`/alunos/modelo`).

## Formato

- Arquivo `.xlsx` (primeira aba) ou `.csv` (separado por `;` ou `,`, em UTF-8).
- Primeira linha: cabeçalho. Uma linha por aluno.
- As colunas podem estar em qualquer ordem; maiúsculas e acentos no cabeçalho não importam; colunas a mais são ignoradas.

| Coluna                      | Obrigatória | Regra                                                                                                               |
| --------------------------- | :---------: | ------------------------------------------------------------------------------------------------------------------- |
| **Matrícula**               |     sim     | identifica o aluno; se já existir no sistema, os dados são **atualizados**                                          |
| **Nome do aluno**           |     sim     | espaços extras são removidos                                                                                        |
| **Turma**                   |     sim     | gravada em maiúsculas (`5a` → `5A`)                                                                                 |
| **Telefone do responsável** |     sim     | **celular** com DDD, com ou sem máscara/+55. É o número que recebe os avisos de WhatsApp. Telefone fixo é recusado. |

## O que acontece na importação

- Faltou alguma das 4 colunas → **nada é importado** e o sistema diz quais colunas faltam.
- Linha sem matrícula, sem nome, sem turma ou com telefone inválido → linha **recusada**; as demais entram.
- Matrícula repetida dentro do mesmo arquivo → vale a primeira linha; as seguintes são recusadas.
- Ao final, o sistema mostra quantos foram importados (novos e atualizados) e a lista dos recusados, com a linha da planilha e o motivo.
- A situação do aluno (ativo/transferido) **não** é alterada pela importação.

## A confirmar com a secretaria

- Se a planilha deles já tem uma coluna de matrícula com esse nome ou se precisaremos aceitar outro nome (ex.: "RA").
- Se há alunos cujo responsável só tem telefone fixo (hoje recusados, porque o contato é por WhatsApp).
