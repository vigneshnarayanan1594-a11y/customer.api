'use strict';

const { Injectable } = require('@nestjs/common');
const { map } = require('rxjs/operators');

// Success envelope: { status: 'success', code, msg, data }.
// Handlers return a plain object; an optional `resp_msg` key becomes `msg`.
@Injectable()
class TransformInterceptor {
  intercept(context, next) {
    const reply = context.switchToHttp().getResponse();
    return next.handle().pipe(
      map((result) => {
        const { resp_msg: msg = '', ...data } = result ?? {};
        return { status: 'success', code: reply.statusCode, msg, data };
      }),
    );
  }
}

module.exports = { TransformInterceptor };
