/** Erro de regra de negócio: a mensagem é mostrada ao usuário. */
export class BusinessError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'BusinessError'
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('É preciso entrar no sistema.')
    this.name = 'UnauthenticatedError'
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('Seu perfil não tem acesso a esta função.')
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} não encontrado.`)
    this.name = 'NotFoundError'
  }
}
