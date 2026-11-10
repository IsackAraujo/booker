import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'

// Modelo descrito em ARCHITECTURE.md §4. Nomes em inglês; valores de enum em português (aparecem na tela).

export const userRole = pgEnum('user_role', ['bibliotecaria', 'professor', 'coordenacao'])
export const copyStatus = pgEnum('copy_status', [
  'disponivel',
  'emprestado',
  'separado',
  'perdido',
  'danificado',
])
export const studentStatus = pgEnum('student_status', ['ativo', 'transferido'])
export const returnCondition = pgEnum('return_condition', ['ok', 'perdido', 'danificado'])
export const classReservationStatus = pgEnum('class_reservation_status', ['ativa', 'cancelada', 'atendida'])
export const holdStatus = pgEnum('hold_status', [
  'aguardando',
  'avisado',
  'expirada',
  'atendida',
  'cancelada',
])
export const notificationKind = pgEnum('notification_kind', ['lembrete', 'cobranca', 'reserva_disponivel'])
export const notificationStatus = pgEnum('notification_status', ['enviado', 'falhou'])

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()

export const users = pgTable('users', {
  id: serial().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  role: userRole().notNull(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
})

export const books = pgTable('books', {
  id: serial().primaryKey(),
  title: text().notNull(),
  author: text().notNull(),
  category: text().notNull(),
  ageRange: text().notNull(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
})

export const copies = pgTable(
  'copies',
  {
    id: serial().primaryKey(),
    bookId: integer()
      .notNull()
      .references(() => books.id),
    code: text().notNull().unique(),
    status: copyStatus().notNull().default('disponivel'),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.bookId)],
)

export const students = pgTable(
  'students',
  {
    id: serial().primaryKey(),
    registration: text().notNull().unique(),
    name: text().notNull(),
    className: text().notNull(),
    guardianPhone: text().notNull(),
    status: studentStatus().notNull().default('ativo'),
    transferredAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [index().on(t.className)],
)

export const loans = pgTable(
  'loans',
  {
    id: serial().primaryKey(),
    copyId: integer()
      .notNull()
      .references(() => copies.id),
    studentId: integer()
      .notNull()
      .references(() => students.id),
    teacherId: integer().references(() => users.id),
    loanedAt: timestamp({ withTimezone: true }).notNull(),
    dueDate: date({ mode: 'string' }).notNull(),
    returnedAt: timestamp({ withTimezone: true }),
    returnCondition: returnCondition(),
    returnedLate: boolean(),
    createdBy: integer()
      .notNull()
      .references(() => users.id),
    returnedBy: integer().references(() => users.id),
  },
  (t) => [
    // Um exemplar só pode ter um empréstimo aberto (US04-CA4).
    uniqueIndex('loans_one_open_per_copy')
      .on(t.copyId)
      .where(sql`${t.returnedAt} is null`),
    index().on(t.studentId),
    index().on(t.dueDate),
  ],
)

export const classReservations = pgTable(
  'class_reservations',
  {
    id: serial().primaryKey(),
    teacherId: integer()
      .notNull()
      .references(() => users.id),
    bookId: integer()
      .notNull()
      .references(() => books.id),
    className: text().notNull(),
    quantity: integer().notNull(),
    activityDate: date({ mode: 'string' }).notNull(),
    status: classReservationStatus().notNull().default('ativa'),
    createdAt: createdAt(),
    cancelledAt: timestamp({ withTimezone: true }),
  },
  (t) => [check('class_reservations_quantity_positive', sql`${t.quantity} > 0`), index().on(t.activityDate)],
)

export const holdQueue = pgTable(
  'hold_queue',
  {
    id: serial().primaryKey(),
    bookId: integer()
      .notNull()
      .references(() => books.id),
    studentId: integer()
      .notNull()
      .references(() => students.id),
    status: holdStatus().notNull().default('aguardando'),
    copyId: integer().references(() => copies.id),
    notifiedAt: timestamp({ withTimezone: true }),
    holdUntil: date({ mode: 'string' }),
    createdAt: createdAt(),
  },
  (t) => [
    // Aluno não entra duas vezes na fila do mesmo título (US12-CA2).
    uniqueIndex('hold_queue_one_active_per_student')
      .on(t.bookId, t.studentId)
      .where(sql`${t.status} in ('aguardando', 'avisado')`),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: serial().primaryKey(),
    kind: notificationKind().notNull(),
    loanId: integer().references(() => loans.id),
    holdId: integer().references(() => holdQueue.id),
    phone: text().notNull(),
    body: text().notNull(),
    status: notificationStatus().notNull(),
    error: text(),
    createdBy: integer().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    // Lembrete enviado com sucesso uma única vez por empréstimo (US07-CA1).
    uniqueIndex('notifications_one_reminder_per_loan')
      .on(t.loanId)
      .where(sql`${t.kind} = 'lembrete' and ${t.status} = 'enviado'`),
    index().on(t.loanId),
  ],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: serial().primaryKey(),
    userId: integer()
      .notNull()
      .references(() => users.id),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: integer(),
    payload: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt), index().on(t.userId)],
)

export const settings = pgTable(
  'settings',
  {
    id: integer().primaryKey().default(1),
    loanDays: integer().notNull().default(14),
    maxActiveLoans: integer().notNull().default(2),
    blockWhenOverdue: boolean().notNull().default(true),
    holdPickupDays: integer().notNull().default(2),
    reminderDaysBefore: integer().notNull().default(3),
  },
  (t) => [check('settings_single_row', sql`${t.id} = 1`)],
)
