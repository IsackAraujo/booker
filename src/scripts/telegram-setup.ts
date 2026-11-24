export {}

// Configura o bot do Telegram: confere o token e aponta o webhook para o site (ADR 8).
// Uso: npm run telegram:setup  (lê TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET e APP_URL do ambiente)
// Docs: https://core.telegram.org/bots/api#getme e https://core.telegram.org/bots/api#setwebhook

const token = process.env.TELEGRAM_BOT_TOKEN
const secret = process.env.TELEGRAM_WEBHOOK_SECRET
const appUrl = process.env.APP_URL?.replace(/\/$/, '')

if (!token || !secret || !appUrl) {
  console.error(
    'Defina TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET e APP_URL (ex.: https://biblioteca.exemplo.com).',
  )
  process.exit(1)
}
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error('TELEGRAM_WEBHOOK_SECRET só pode ter letras, números, _ e - (até 256 caracteres).')
  process.exit(1)
}

const api = (method: string, body?: unknown) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.json() as Promise<{ ok: boolean; result?: { username?: string }; description?: string }>)

const me = await api('getMe')
if (!me.ok) {
  console.error(`Token recusado pelo Telegram: ${me.description}`)
  process.exit(1)
}
console.log(`Bot: @${me.result?.username}  (use em TELEGRAM_BOT_USERNAME)`)

const hook = await api('setWebhook', {
  url: `${appUrl}/api/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ['message'],
})
if (!hook.ok) {
  console.error(`setWebhook falhou: ${hook.description}`)
  process.exit(1)
}
console.log(`Webhook configurado em ${appUrl}/api/telegram/webhook`)
