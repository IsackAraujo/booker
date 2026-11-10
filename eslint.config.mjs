import next from 'eslint-config-next'

const config = [
  ...next,
  {
    ignores: ['.next/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'src/db/migrations/**'],
  },
  {
    // Regras de negócio não podem ler a data do sistema: use o clock (ARCHITECTURE.md §8).
    files: ['src/modules/**/rules.ts', 'src/modules/**/service.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use clock.now() / clock.today() em vez de new Date().',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Use clock.now() em vez de Date.now().',
        },
      ],
    },
  },
]

export default config
