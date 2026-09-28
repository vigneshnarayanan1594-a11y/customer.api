'use strict';

// NestJS LoggerService backed by pino. Registered with app.useLogger(), so both Nest's own
// messages and every `new Logger(Context)` in the app end up as pino JSON lines.
class PinoLoggerService {
  constructor(pinoLogger) {
    this.pino = pinoLogger;
  }

  log(message, ...params) { this.write('info', message, params); }
  error(message, ...params) { this.write('error', message, params); }
  warn(message, ...params) { this.write('warn', message, params); }
  debug(message, ...params) { this.write('debug', message, params); }
  verbose(message, ...params) { this.write('trace', message, params); }
  fatal(message, ...params) { this.write('fatal', message, params); }

  write(level, message, params) {
    const args = [...params];
    // Nest passes the context as the last string argument, and a stack before it for errors.
    const context = args.length && typeof args[args.length - 1] === 'string' ? args.pop() : undefined;
    const fields = context ? { context } : {};
    let text = message;

    if (message instanceof Error) {
      fields.err = message;
      text = message.message;
    } else if (message && typeof message === 'object') {
      const { msg, ...rest } = message;
      Object.assign(fields, rest);
      text = msg;
    }
    if (level === 'error' && typeof args[0] === 'string') fields.stack = args[0];

    this.pino[level](fields, text);
  }
}

module.exports = { PinoLoggerService };
