# Implantação: colocar o Booker no ar

Passo a passo do que **depende de uma pessoa** para o sistema funcionar de verdade: contas, segredos e configurações. O código já está pronto no `main`.

Ordem recomendada: 1 → 2 → 3 → 4 → 5 → 6. Cada passo diz onde o resultado é usado.

## 1. Banco de dados PostgreSQL (≈10 min)

A sugestão do `ARCHITECTURE.md` é o Neon, que tem plano gratuito.

1. Crie a conta e um projeto em https://neon.com (região: São Paulo, se houver; senão a mais próxima).
2. Copie a **connection string** (`postgresql://...`). Ela vai em `DATABASE_URL`.
3. Aplique as migrações a partir do seu computador:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate
   ```

Documentação: https://neon.com/docs/get-started/signing-up

## 2. Publicar o site (≈15 min)

A sugestão é a Vercel, que tem plano gratuito e integração com o GitHub.

1. Entre em https://vercel.com com a conta do GitHub e importe o repositório `IsackAraujo/booker`.
2. Em **Settings → Environment Variables**, cadastre:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a connection string do passo 1 |
   | `AUTH_SECRET` | 32 caracteres aleatórios ou mais. Gere com: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
   | `CRON_SECRET` | outro valor aleatório, gerado do mesmo jeito |
   | `MESSAGE_SENDER` | `telegram` |
   | `TELEGRAM_BOT_TOKEN` | do passo 3 |
   | `TELEGRAM_BOT_USERNAME` | do passo 3, sem `@` |
   | `TELEGRAM_WEBHOOK_SECRET` | outro valor aleatório (só letras, números, `_` e `-`) |
   | `APP_URL` | o endereço do site, ex.: `https://booker-escola.vercel.app` |
   | `TZ` | `America/Sao_Paulo` |

3. Faça o deploy e anote o endereço.

Documentação: https://vercel.com/docs/getting-started-with-vercel e https://vercel.com/docs/environment-variables

> **Nunca** coloque `DEV_SESSION_ROLE` em produção. Ele é só para desenvolvimento e testes (e o sistema o ignora em produção).

## 3. Bot do Telegram (≈5 min)

1. No Telegram, abra o [@BotFather](https://t.me/BotFather) e envie `/newbot`.
2. Escolha o nome (ex.: "Biblioteca da Escola") e o usuário, terminado em `bot` (ex.: `biblioteca_escola_bot`).
3. Guarde o **token** que ele devolve, como uma senha. Ele vai em `TELEGRAM_BOT_TOKEN`; o usuário vai em `TELEGRAM_BOT_USERNAME`.
4. Opcional: `/setdescription` (texto antes de a pessoa iniciar a conversa) e `/setuserpic` (logo da escola).

Documentação: https://core.telegram.org/bots/tutorial

## 4. Ligar o bot ao site (≈2 min, depois dos passos 2 e 3)

No seu computador, com os mesmos valores da Vercel:

```bash
TELEGRAM_BOT_TOKEN="..." TELEGRAM_WEBHOOK_SECRET="..." APP_URL="https://..." npm run telegram:setup
```

O comando confere o token e registra o webhook (`/api/telegram/webhook`). Ele mostra o usuário do bot, que deve ser o mesmo de `TELEGRAM_BOT_USERNAME`.

**Teste:** abra o cadastro de um aluno de teste no site, copie o link "Avisos pelo Telegram", abra no seu celular e toque em Iniciar. O bot deve responder "Pronto! Você vai receber por aqui os avisos da biblioteca sobre …", e a tela do aluno passa a mostrar "Responsável vinculado".

Documentação: https://core.telegram.org/bots/api#setwebhook

## 5. Lembretes diários (≈3 min)

A rotina de lembretes (US07) roda pelo GitHub Actions, todo dia às 08:00 de Brasília.

1. No GitHub: **Settings → Secrets and variables → Actions → New repository secret** (precisa ser o dono do repositório).
2. Crie `APP_URL` (o endereço do site) e `CRON_SECRET` (o mesmo valor da Vercel).
3. Teste em **Actions → Lembretes diários → Run workflow**. O resultado mostra quantos lembretes foram enviados.

Documentação: https://docs.github.com/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions

## 6. Primeiro acesso (≈2 min)

A primeira bibliotecária é criada pelo terminal; as outras pessoas ela cadastra pela tela **Usuários**.

```bash
DATABASE_URL="postgresql://..." npm run user:create -- "Roseli Souza" roseli@escola.edu.br bibliotecaria
```

O comando pede a senha inicial (mínimo de 8 caracteres). Depois, entre no site com esse e-mail e cadastre a professora, a coordenação e as substitutas.

## Depois de no ar

- **Alunos:** importe a planilha da secretaria (**Alunos → Importar planilha**).
- **Telegram dos responsáveis:** em **Alunos → Links do Telegram**, escolha a turma e imprima os QR codes para mandar para casa. Quem não abrir o link aparece como "sem Telegram" em Atrasos e Avisos.
- **Avisos que falharam** aparecem em **Avisos**, com o motivo.
