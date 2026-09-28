'use strict';

// Turns one sheet record into the documents of the six collections, or a row error.
// Rules come from profiling the sample sheet (see docs/DESIGN.md §2).

const REQUIRED_COLUMNS = Object.freeze([
  'agent', 'userType', 'policy_number', 'policy_start_date', 'policy_end_date',
  'category_name', 'company_name', 'account_name', 'firstname', 'email', 'dob',
]);

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const str = (value) => {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
};

// Blank cells omit the key, so a blank never overwrites a value from an earlier import.
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// 'YYYY-MM-DD' → UTC midnight Date. Must survive a round trip: JS would silently roll
// 2019-02-30 over to 2 March.
function toDate(value) {
  const s = str(value);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const date = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s ? date : null;
}

// '(336) 761-8572 Ext.0012' → { phone: '3367618572', phoneExtension: '0012' }.
// Anything that isn't 10 digits is kept as written.
function toPhone(value) {
  const s = str(value);
  if (!s) return {};
  const [main, ext] = s.split(/\s*ext\.?\s*/i);
  const digits = main.replace(/\D/g, '');
  return compact({ phone: digits.length === 10 ? digits : main, phoneExtension: str(ext) });
}

const toNumber = (value) => {
  const s = str(value);
  return s === undefined ? undefined : Number(s);
};

function missingColumns(headers) {
  return REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
}

function normalizeRow(record, row) {
  const fail = (field, message) => ({ error: { row, field, message } });

  const required = {
    agent: str(record.agent),
    category_name: str(record.category_name),
    company_name: str(record.company_name),
    account_name: str(record.account_name),
    userType: str(record.userType),
    policy_number: str(record.policy_number),
    firstname: str(record.firstname),
    email: str(record.email)?.toLowerCase(),
  };
  for (const [field, value] of Object.entries(required)) {
    if (!value) return fail(field, 'required');
  }
  if (!EMAIL.test(required.email)) return fail('email', 'invalid email');

  const dob = toDate(record.dob);
  const policyStartDate = toDate(record.policy_start_date);
  const policyEndDate = toDate(record.policy_end_date);
  if (!dob) return fail('dob', 'expected YYYY-MM-DD');
  if (!policyStartDate) return fail('policy_start_date', 'expected YYYY-MM-DD');
  if (!policyEndDate) return fail('policy_end_date', 'expected YYYY-MM-DD');
  if (policyEndDate < policyStartDate) return fail('policy_end_date', 'before policy_start_date');

  const premiumAmount = toNumber(record.premium_amount);
  const policyMode = toNumber(record.policy_mode);
  if (Number.isNaN(premiumAmount)) return fail('premium_amount', 'not a number');
  if (Number.isNaN(policyMode)) return fail('policy_mode', 'not a number');

  return {
    value: {
      agent: required.agent,
      lob: required.category_name,
      carrier: required.company_name,
      user: compact({
        firstName: required.firstname,
        email: required.email,
        dob,
        userType: required.userType,
        gender: str(record.gender),
        address: str(record.address),
        city: str(record.city)?.replace(/,+$/, ''),
        state: str(record.state),
        zip: str(record.zip)?.replace(/-_+$/, ''),
        ...toPhone(record.phone),
      }),
      account: compact({ accountName: required.account_name, accountType: str(record.account_type) }),
      policy: compact({
        policyNumber: required.policy_number,
        policyStartDate,
        policyEndDate,
        premiumAmount,
        policyMode,
        policyType: str(record.policy_type),
        producer: str(record.producer),
        csr: str(record.csr),
      }),
    },
  };
}

module.exports = { REQUIRED_COLUMNS, missingColumns, normalizeRow, toDate, toPhone };
