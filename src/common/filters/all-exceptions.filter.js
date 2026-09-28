'use strict';

const { Catch, Logger } = require('@nestjs/common');
const { toErrorEnvelope } = require('./error-envelope');

// Single catch-all filter: HttpExceptions (incl. validation errors) keep their status and message;
// anything else becomes a logged 500 with a generic message.
@Catch()
class AllExceptionsFilter {
  constructor() {
    this.logger = new Logger('ExceptionFilter');
  }

  catch(exception, host) {
    const reply = host.switchToHttp().getResponse();
    const body = toErrorEnvelope(exception);
    if (body.code >= 500) {
      this.logger.error({ msg: 'unhandled error', err: exception });
    }
    reply.status(body.code).send(body);
  }
}

module.exports = { AllExceptionsFilter };
