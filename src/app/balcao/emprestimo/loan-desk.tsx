'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { FormMessage } from '@/components/form-message'
import { idle } from '@/lib/action'
import {
  previewLoanAction,
  registerLoanAction,
  searchBorrowersAction,
  searchCopiesAction,
} from '@/modules/loans/actions'
import type { Borrower, LoanableCopy } from '@/modules/loans/service'

const dateBr = (iso: string) => iso.split('-').reverse().join('/')
const livros = (n: number) => (n === 1 ? '1 livro' : `${n} livros`)

function borrowerLine(s: Borrower) {
  const parts = [`${s.className}`, `matrícula ${s.registration}`]
  if (s.activeLoans) parts.push(`${livros(s.activeLoans)} com ele`)
  if (s.overdueLoans) parts.push(`${s.overdueLoans} em atraso`)
  if (s.status === 'transferido') parts.push('transferido')
  return parts.join(' · ')
}

/**
 * Balcão de empréstimo (US04): busca rápida do aluno e do exemplar (T4.1), conferência com a data de devolução
 * calculada e os avisos de limite/atraso (T4.2, T4.3) e confirmação. Funciona com leitor de código de barras:
 * o código lido no campo do exemplar seleciona direto quando bate exatamente com um exemplar disponível.
 */
export function LoanDesk() {
  const [student, setStudent] = useState<Borrower | null>(null)
  const [copy, setCopy] = useState<LoanableCopy | null>(null)
  const [students, findStudents, findingStudents] = useActionState(searchBorrowersAction, idle)
  // Código lido que bate exatamente com um exemplar disponível: seleciona sem precisar clicar.
  const [copies, findCopies, findingCopies] = useActionState(
    async (prev: Awaited<ReturnType<typeof searchCopiesAction>>, form: FormData) => {
      const result = await searchCopiesAction(prev, form)
      const code = String(form.get('q') ?? '')
        .replace(/\s+/g, '')
        .toUpperCase()
      const exact =
        result.status === 'ok' && result.data.find((c) => c.code.toUpperCase() === code && !c.unavailable)
      if (exact) setCopy(exact)
      return result
    },
    idle,
  )
  const [preview, runPreview, previewing] = useActionState(previewLoanAction, idle)
  // Registrado: limpa para o próximo atendimento.
  const [done, register, registering] = useActionState(
    async (prev: Awaited<ReturnType<typeof registerLoanAction>>, form: FormData) => {
      const result = await registerLoanAction(prev, form)
      if (result.status === 'ok') {
        setStudent(null)
        setCopy(null)
      }
      return result
    },
    idle,
  )
  const studentRef = useRef<HTMLInputElement>(null)
  const copyRef = useRef<HTMLInputElement>(null)

  // Com aluno e exemplar escolhidos, busca a conferência (prazo e avisos).
  useEffect(() => {
    if (!student || !copy) return
    const form = new FormData()
    form.set('studentId', String(student.id))
    form.set('copyId', String(copy.id))
    startTransition(() => runPreview(form))
  }, [student, copy, runPreview])

  useEffect(() => {
    if (done.status === 'ok') studentRef.current?.focus()
  }, [done])

  useEffect(() => {
    if (student && !copy) copyRef.current?.focus()
  }, [student, copy])

  const current =
    preview.status === 'ok' &&
    student &&
    copy &&
    preview.data.student.id === student.id &&
    preview.data.copy.id === copy.id
      ? preview.data
      : null

  return (
    <div className="space-y-4">
      {done.status === 'ok' && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Empréstimo registrado: {done.data.bookTitle} ({done.data.copyCode}) para {done.data.studentName} —{' '}
          {done.data.className}. Devolver até {dateBr(done.data.dueDate)}.
          {done.data.warnings.length > 0 && ` Atenção: ${done.data.warnings.join(' ')}`}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3" aria-labelledby="aluno-titulo">
          <h2 id="aluno-titulo" className="font-semibold">
            1. Aluno
          </h2>
          {student ? (
            <Chosen
              title={student.name}
              detail={borrowerLine(student)}
              onChange={() => {
                setStudent(null)
                studentRef.current?.focus()
              }}
              label="Trocar aluno"
            />
          ) : (
            <>
              <form action={findStudents} className="flex gap-2">
                <input
                  ref={studentRef}
                  name="q"
                  className="input"
                  placeholder="Nome ou matrícula"
                  aria-label="Buscar aluno"
                  autoFocus
                  autoComplete="off"
                  required
                />
                <button className="btn-secondary" disabled={findingStudents}>
                  Buscar aluno
                </button>
              </form>
              {students.status === 'error' && <FormMessage state={students} />}
              {students.status === 'ok' &&
                (students.data.length === 0 ? (
                  <p className="text-sm text-slate-600">Nenhum aluno encontrado.</p>
                ) : (
                  <ul className="divide-y divide-slate-200 text-sm">
                    {students.data.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setStudent(s)}
                          className="w-full py-2 text-left hover:bg-slate-50"
                          aria-label={`Escolher ${s.name}`}
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className="block text-slate-500">{borrowerLine(s)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </>
          )}
        </section>

        <section className="card space-y-3" aria-labelledby="exemplar-titulo">
          <h2 id="exemplar-titulo" className="font-semibold">
            2. Exemplar
          </h2>
          {copy ? (
            <Chosen
              title={copy.bookTitle}
              detail={`${copy.code} · ${copy.author}`}
              onChange={() => {
                setCopy(null)
                copyRef.current?.focus()
              }}
              label="Trocar exemplar"
            />
          ) : (
            <>
              <form action={findCopies} className="flex gap-2">
                <input
                  ref={copyRef}
                  name="q"
                  className="input"
                  placeholder="Código do exemplar ou título"
                  aria-label="Buscar exemplar"
                  autoComplete="off"
                  required
                />
                <button className="btn-secondary" disabled={findingCopies}>
                  Buscar exemplar
                </button>
              </form>
              {copies.status === 'error' && <FormMessage state={copies} />}
              {copies.status === 'ok' &&
                (copies.data.length === 0 ? (
                  <p className="text-sm text-slate-600">Nenhum exemplar encontrado.</p>
                ) : (
                  <ul className="divide-y divide-slate-200 text-sm">
                    {copies.data.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setCopy(c)}
                          disabled={Boolean(c.unavailable)}
                          className="w-full py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`Escolher exemplar ${c.code}`}
                        >
                          <span className="font-medium">{c.bookTitle}</span>{' '}
                          <span className="font-mono text-slate-600">{c.code}</span>
                          <span className="block text-slate-500">{c.unavailable ?? 'Disponível'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </>
          )}
        </section>
      </div>

      {student && copy && (
        <form action={register} className="card space-y-3" aria-labelledby="conferir-titulo">
          <input type="hidden" name="studentId" value={student.id} />
          <input type="hidden" name="copyId" value={copy.id} />
          <h2 id="conferir-titulo" className="text-lg font-semibold">
            Confira antes de registrar
          </h2>
          {preview.status === 'error' && <FormMessage state={preview} />}
          {previewing && !current && <p className="text-sm text-slate-600">Conferindo…</p>}
          {current && (
            <>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-slate-500">Aluno</dt>
                <dd>
                  {current.student.name} — {current.student.className}
                </dd>
                <dt className="text-slate-500">Livro</dt>
                <dd>
                  {current.copy.bookTitle} ({current.copy.code})
                </dd>
                <dt className="text-slate-500">Devolução</dt>
                <dd className="font-semibold">{dateBr(current.dueDate)}</dd>
              </dl>
              {current.check.blocks.map((b) => (
                <p key={b} role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                  {b}
                </p>
              ))}
              {current.check.warnings.map((w) => (
                <p key={w} className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
                  {w}
                </p>
              ))}
              {current.openLoans.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium">Livros que o aluno já tem:</p>
                  <ul className="list-disc pl-5 text-slate-700">
                    {current.openLoans.map((l) => (
                      <li key={l.loanId}>
                        {l.bookTitle} ({l.copyCode}) — devolver até {dateBr(l.dueDate)}
                        {l.daysLate > 0 && (
                          <span className="ml-1 text-amber-900">
                            ({l.daysLate} {l.daysLate === 1 ? 'dia' : 'dias'} de atraso)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button className="btn" disabled={registering || !current.check.allowed}>
                {registering ? 'Registrando…' : 'Registrar empréstimo'}
              </button>
            </>
          )}
          {done.status === 'error' && <FormMessage state={done} />}
        </form>
      )}
    </div>
  )
}

function Chosen({
  title,
  detail,
  onChange,
  label,
}: {
  title: string
  detail: string
  onChange: () => void
  label: string
}) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-slate-500">{detail}</p>
      </div>
      <button type="button" onClick={onChange} className="text-emerald-800 underline">
        {label}
      </button>
    </div>
  )
}
