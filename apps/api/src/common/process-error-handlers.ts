import type { LoggerService } from '@nestjs/common';

/**
 * Without these, an uncaught exception or unhandled rejection prints a raw
 * stack trace straight to stderr, bypassing Pino entirely — invisible to
 * any log aggregation configured to parse structured JSON from stdout. Routes
 * both through the same logger as every other log line, then exits for
 * uncaughtException specifically: per Node's own guidance, the process is in
 * an undefined state afterward and should not keep serving traffic.
 */
export function installProcessErrorHandlers(logger: LoggerService): void {
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception — process exiting: ${err.message}`, err.stack, 'Process');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error(`Unhandled promise rejection: ${err.message}`, err.stack, 'Process');
  });
}
