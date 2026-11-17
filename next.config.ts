import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PGlite e ExcelJS rodam só no servidor; não devem ser empacotados pelo bundler.
  serverExternalPackages: ['@electric-sql/pglite', 'exceljs'],
}

export default nextConfig
