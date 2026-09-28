'use strict';

// Run through `pnpm test`: the scripts start Jest with --experimental-vm-modules because the MongoDB
// driver (7.x) loads `os` with a dynamic import(), which Jest's CommonJS sandbox only supports with
// that flag. Without it the driver's handshake metadata is incomplete and the server rejects it.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.js'],
  transform: { '\\.js$': 'babel-jest' },
  testTimeout: 120000,
};
