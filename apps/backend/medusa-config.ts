import { loadEnv, defineConfig, MedusaError } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

if (process.env.RIGBY_REPLAY === '1') {
  const database = new URL(process.env.DATABASE_URL!)
  if (!['localhost', '127.0.0.1'].includes(database.hostname) ||
      database.port !== '5433' || database.pathname !== '/rigby_medusa_replay') {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Replay mode requires the isolated local replay database')
  }
}

module.exports = defineConfig({
  modules: [
    { resolve: './src/modules/wishlist' },
    { resolve: './src/modules/loyalty' },
  ],
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  }
})
