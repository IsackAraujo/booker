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
