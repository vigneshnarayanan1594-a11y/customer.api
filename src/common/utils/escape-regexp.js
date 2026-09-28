'use strict';

// Escapes user input for use inside a RegExp (Node 24 has RegExp.escape; this also covers Node 22).
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegExp };
