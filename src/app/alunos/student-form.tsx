'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/form-message'
import { idle } from '@/lib/action'
import { saveStudentAction } from '@/modules/students/actions'

interface Props {
  student?: { id: number; registration: string; name: string; className: string; guardianPhone: string }
}

export function StudentForm({ student }: Props) {
  const [state, action, pending] = useActionState(saveStudentAction, idle)

  return (
    <form action={action} className="card max-w-lg space-y-3">
      {student && <input type="hidden" name="id" value={student.id} />}
      <Field label="Matrícula" name="registration" defaultValue={student?.registration} />
      <Field label="Nome do aluno" name="name" defaultValue={student?.name} />
      <Field label="Turma" name="className" defaultValue={student?.className} />
      <Field
        label="Telefone do responsável (WhatsApp)"
        name="guardianPhone"
        defaultValue={student?.guardianPhone}
        placeholder="(51) 99999-0000"
        type="tel"
      />
      <FormMessage state={state} />
      <button className="btn" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  )
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = 'text',
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="input"
        required
      />
    </label>
  )
}
