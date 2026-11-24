export {}

// Cria um usuário direto no banco. Uso principal: a primeira bibliotecária em produção (depois ela cadastra
// os outros pela tela /usuarios). Pede a senha no terminal para não ficar no histórico do shell.
// Uso: npm run user:create -- "Roseli Souza" roseli@escola.edu.br bibliotecaria

import { createInterface } from 'node:readline/promises'
import bcrypt from 'bcryptjs'
import { drizzle } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { PGlite } from '@electric-sql/pglite'
import * as schema from '../db/schema'
import type { Db } from '../db/types'
import { normalizeEmail, validateUser } from '../modules/users/rules'

const [name = '', email = '', role = ''] = process.argv.slice(2)
const rl = createInterface({ input: process.stdin, output: process.stdout })
const password = await rl.question('Senha inicial (mínimo 8 caracteres): ')
rl.close()

const errors = validateUser({ name, email, role, password })
if (errors.length) {
  console.error(`Não criado: ${errors.join('; ')}`)
  console.error('Uso: npm run user:create -- "Nome" email@escola perfil   (perfil: bibliotecaria | professor | coordenacao)')
  process.exit(1)
}

const db = (process.env.DATABASE_URL
  ? drizzle(process.env.DATABASE_URL, { schema, casing: 'snake_case' })
  : drizzlePglite(new PGlite(process.env.PGLITE_DIR || './.pglite'), { schema, casing: 'snake_case' })) as unknown as Db

const [created] = await db
  .insert(schema.users)
  .values({
    name: name.trim(),
    email: normalizeEmail(email),
    role: role as 'bibliotecaria' | 'professor' | 'coordenacao',
    passwordHash: await bcrypt.hash(password, 10),
  })
  .onConflictDoNothing()
  .returning({ id: schema.users.id })

console.log(created ? `Usuário criado (id ${created.id}).` : 'Já existe usuário com este e-mail; nada foi alterado.')
process.exit(0)
