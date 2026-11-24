import type { IsoDate } from '@/lib/clock'

// Textos das mensagens. Puros: recebem tudo por parâmetro.

const dateBr = (iso: IsoDate) => iso.split('-').reverse().join('/')

/** Aviso de atraso ao responsável (US08). Tom neutro, sem constranger o aluno. */
export function overdueNoticeText(input: {
  studentName: string
  bookTitle: string
  dueDate: IsoDate
  daysLate: number
}): string {
  const dias = input.daysLate === 1 ? '1 dia' : `${input.daysLate} dias`
  return (
    `Olá! A biblioteca da escola lembra que o livro "${input.bookTitle}", emprestado para ${input.studentName}, ` +
    `deveria ter sido devolvido em ${dateBr(input.dueDate)} (${dias} de atraso). ` +
    `Por favor, peça para devolvê-lo na biblioteca. Obrigado!`
  )
}

/** Lembrete antes do prazo (US07-CA2): nome do aluno, título e data de devolução. */
export function reminderText(input: { studentName: string; bookTitle: string; dueDate: IsoDate }): string {
  return (
    `Olá! Lembrete da biblioteca da escola: o livro "${input.bookTitle}", emprestado para ${input.studentName}, ` +
    `deve ser devolvido até ${dateBr(input.dueDate)}. Obrigado!`
  )
}

/**
 * Prazos que recebem lembrete hoje (US07-CA1): de amanhã até `daysBefore` dias à frente. O normal é o lembrete sair
 * exatamente `daysBefore` dias antes; a janela cobre os dias em que a rotina não rodou (servidor fora do ar, feriado).
 * O "uma única vez" é garantido por quem chama: só envia para empréstimo sem lembrete enviado.
 */
export function reminderWindow(today: IsoDate, daysBefore: number): { from: IsoDate; to: IsoDate } {
  const add = (n: number) => {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  return { from: add(1), to: add(Math.max(1, daysBefore)) }
}
