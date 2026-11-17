import { BusinessError, ForbiddenError, NotFoundError, UnauthenticatedError } from './errors'

export type ActionState<T = undefined> =
  { status: 'idle' } | { status: 'ok'; data: T; message?: string } | { status: 'error'; message: string }

export const idle = { status: 'idle' } as const

/**
 * Executa o corpo de uma Server Action e converte erros esperados em mensagem para a tela.
 * Erros inesperados também viram mensagem genérica (e são logados), para o formulário não quebrar.
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionState<T>> {
  try {
    const data = await fn()
    return { status: 'ok', data, message }
  } catch (err) {
    if (
      err instanceof BusinessError ||
      err instanceof ForbiddenError ||
      err instanceof UnauthenticatedError ||
      err instanceof NotFoundError
    ) {
      return { status: 'error', message: err.message }
    }
    console.error(err)
    return { status: 'error', message: 'Não foi possível concluir a operação. Tente de novo.' }
  }
}
