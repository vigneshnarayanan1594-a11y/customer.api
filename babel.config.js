'use strict';

// Source is plain CommonJS JavaScript. Babel only compiles the two things Node doesn't run
// natively yet: decorators (NestJS, class-validator) and decorated class fields. Everything
// else is left as-is for Node >= 22.
module.exports = {
  sourceType: 'unambiguous',
  plugins: [
    ['@babel/plugin-proposal-decorators', { version: 'legacy' }],
    ['@babel/plugin-transform-class-properties', { loose: true }],
  ],
};
