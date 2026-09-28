'use strict';

const { HttpException, HttpStatus } = require('@nestjs/common');

// Maps any thrown value to the failure envelope body: { status: 'failed', code, msg, data }.
// Internal errors never leak their message or stack to the client.
function toErrorEnvelope(exception) {
  if (exception instanceof HttpException) {
    const code = exception.getStatus();
    const response = exception.getResponse();
    const raw = typeof response === 'string' ? response : response?.message ?? exception.message;
    const details = Array.isArray(raw) ? raw : response?.details;
    const msg = Array.isArray(raw) ? raw.join('; ') : String(raw);
    return { status: 'failed', code, msg, data: details ? { details } : {} };
  }

  // Errors raised by Fastify itself (bad JSON, body too large, …) carry a 4xx statusCode.
  const fastifyStatus = Number(exception?.statusCode);
  if (fastifyStatus >= 400 && fastifyStatus < 500) {
    return { status: 'failed', code: fastifyStatus, msg: exception.message, data: {} };
  }

  if (exception?.code === 11000) {
    return { status: 'failed', code: HttpStatus.CONFLICT, msg: 'Duplicate key', data: {} };
  }

  return { status: 'failed', code: HttpStatus.INTERNAL_SERVER_ERROR, msg: 'Internal server error', data: {} };
}

module.exports = { toErrorEnvelope };
