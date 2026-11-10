import { buildTemplate } from '@/modules/students/spreadsheet'

/** Modelo da planilha de alunos para a secretaria (T2.1). */
export async function GET() {
  const data = await buildTemplate()
  return new Response(data, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo-alunos.xlsx"',
    },
  })
}
