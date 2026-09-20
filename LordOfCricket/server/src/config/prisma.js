import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger.js'

// Single shared Prisma client for the whole process, same pattern as the
// existing `pool` singleton in config/db.js — never instantiate PrismaClient
// per request/controller (each instance opens its own connection pool).
export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
})

prisma.$on('error', (e) => {
  logger.error('Prisma client error', { message: e.message })
})

prisma.$on('warn', (e) => {
  logger.warn('Prisma client warning', { message: e.message })
})

export async function connectPrisma() {
  await prisma.$queryRaw`SELECT 1`
  logger.info('Prisma connected')
}

export async function disconnectPrisma() {
  await prisma.$disconnect()
}
