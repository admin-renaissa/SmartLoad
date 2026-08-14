import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'node:path'

const LOG_DIR = process.env.TALLY_BRIDGE_LOG_DIR ?? './logs'

/**
 * Shared Winston logger for SmartLoad Tally Bridge.
 *
 * Transports:
 *   1. DailyRotateFile (all levels) — bridge-YYYY-MM-DD.log, kept 14 days, gzip-compressed.
 *   2. DailyRotateFile (error level) — bridge-error-YYYY-MM-DD.log, kept 30 days.
 *   3. Console (development only) — colorized simple format.
 *
 * Log level is controlled by LOG_LEVEL env var (default: 'info').
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    // All-levels daily rotating file
    new DailyRotateFile({
      dirname:       path.resolve(LOG_DIR),
      filename:      'bridge-%DATE%.log',
      datePattern:   'YYYY-MM-DD',
      maxFiles:      '14d',
      zippedArchive: true,
      maxSize:       '20m',
    }),
    // Error-only daily rotating file
    new DailyRotateFile({
      dirname:       path.resolve(LOG_DIR),
      filename:      'bridge-error-%DATE%.log',
      datePattern:   'YYYY-MM-DD',
      level:         'error',
      maxFiles:      '30d',
      zippedArchive: true,
    }),
  ],
})

// Console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  )
}
