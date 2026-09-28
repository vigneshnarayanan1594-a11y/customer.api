'use strict';

const { Body, Query, ValidationPipe } = require('@nestjs/common');

// Plain JavaScript has no parameter type metadata, so a global ValidationPipe can't know which
// DTO a handler expects. These helpers bind the DTO class explicitly via `expectedType`:
//   @Bind(ValidQuery(SearchPoliciesQueryDto))  search(query) { … }
//
// DTO decorator order: decorators apply bottom-up, so the check nearest the property runs first
// (e.g. @IsDefined, then @IsString, then @MaxLength). With stopAtFirstError each field reports
// only its most basic problem.
const pipeFor = (Dto) =>
  new ValidationPipe({
    expectedType: Dto,
    transform: true,        // plain object → DTO instance (defaults + @Type conversions)
    whitelist: true,        // drop properties the DTO doesn't declare
    forbidUnknownValues: true,
    stopAtFirstError: true,
  });

const ValidBody = (Dto) => Body(pipeFor(Dto));
const ValidQuery = (Dto) => Query(pipeFor(Dto));

module.exports = { ValidBody, ValidQuery, pipeFor };
