import { BusinessError, ForbiddenError, NotFoundError, UnauthenticatedError } from './errors'
import { currentUser, requireRole, setSessionProvider } from './session'

describe('Sessão e perfis', () => {
  it('[US03-CA1] sem sessão, requireRole recusa com mensagem para a tela', async () => {
    setSessionProvider(async () => null)

    await expect(requireRole('bibliotecaria')).rejects.toBeInstanceOf(UnauthenticatedError)
    await expect(requireRole('bibliotecaria')).rejects.toThrow('É preciso entrar no sistema.')
  })

  it('[US03-CA2] perfil não previsto é recusado', async () => {
    setSessionProvider(async () => ({ id: 1, name: 'Genilse', role: 'professor' }))

    await expect(requireRole('bibliotecaria', 'coordenacao')).rejects.toBeInstanceOf(ForbiddenError)
    await expect(requireRole('bibliotecaria')).rejects.toThrow('Seu perfil não tem acesso a esta função.')
  })

  it('perfil previsto recebe o usuário da sessão', async () => {
    const roseli = { id: 1, name: 'Roseli', role: 'bibliotecaria' as const }
    setSessionProvider(async () => roseli)

    await expect(requireRole('bibliotecaria', 'coordenacao')).resolves.toEqual(roseli)
    await expect(currentUser()).resolves.toEqual(roseli)
  })
})

describe('Erros', () => {
  it('BusinessError guarda mensagem e código', () => {
    const err = new BusinessError('Exemplar já emprestado.', 'LOAN_COPY_TAKEN')

    expect(err).toMatchObject({
      name: 'BusinessError',
      message: 'Exemplar já emprestado.',
      code: 'LOAN_COPY_TAKEN',
    })
  })

  it('NotFoundError monta a mensagem com o que faltou', () => {
    expect(new NotFoundError('Aluno').message).toBe('Aluno não encontrado.')
  })
})
