import { ConsoleLogger, Injectable } from '@nestjs/common'

@Injectable()
export class AppLoggerService extends ConsoleLogger {
  write(level: 'log' | 'error' | 'warn' | 'debug' | 'verbose', message: string, meta: Record<string, unknown> = {}) {
    const entry = {
      level: level === 'log' ? 'info' : level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    }
    const line = JSON.stringify(entry)
    if (level === 'error') console.error(line)
    else console.info(line)
  }

  log(message: string, context?: string) {
    this.write('log', message, context ? { context } : {})
  }

  error(message: string, stack?: string, context?: string) {
    this.write('error', message, { stack, context })
  }

  warn(message: string, context?: string) {
    this.write('warn', message, context ? { context } : {})
  }
}
