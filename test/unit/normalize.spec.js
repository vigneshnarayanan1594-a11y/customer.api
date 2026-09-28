'use strict';

const { missingColumns, normalizeRow, toDate, toPhone, REQUIRED_COLUMNS } = require('../../src/modules/uploads/import/normalize');

const validRecord = () => ({
  agent: 'Alex Watson',
  userType: 'Active Client',
  policy_mode: '12',
  producer: 'Brandie Placencia',
  policy_number: 'YEEX9MOIBU7X',
  premium_amount_written: '',
  premium_amount: '1180.83',
  policy_type: 'Single',
  company_name: 'Integon Gen Ins Corp',
  category_name: 'Commercial Auto',
  policy_start_date: '2018-11-02',
  policy_end_date: '2019-11-02',
  csr: 'Tami Ellison',
  account_name: 'Lura Lucca & Owen Dodson',
  email: 'MAdler@Yahoo.ca',
  gender: '',
  firstname: 'Lura Lucca',
  city: 'MOCKSVILLE',
  account_type: 'Commercial',
  phone: '8677356559',
  address: '170 MATTHIAS CT',
  state: 'NC',
  zip: '27028',
  dob: '1960-02-11',
});

describe('toDate', () => {
  it('parses ISO dates as UTC midnight', () => {
    expect(toDate('2018-11-02').toISOString()).toBe('2018-11-02T00:00:00.000Z');
  });

  it('rejects impossible calendar dates instead of rolling them over', () => {
    expect(toDate('2019-02-30')).toBeNull();
    expect(toDate('2019-13-01')).toBeNull();
  });

  it('rejects other formats', () => {
    expect(toDate('11/02/2018')).toBeNull();
    expect(toDate('')).toBeNull();
    expect(toDate(undefined)).toBeNull();
  });
});

describe('toPhone', () => {
  it('keeps plain 10-digit numbers', () => {
    expect(toPhone('8677356559')).toEqual({ phone: '8677356559' });
  });

  it('strips formatting', () => {
    expect(toPhone('(336) 245-8310')).toEqual({ phone: '3362458310' });
  });

  it('splits off the extension', () => {
    expect(toPhone('(336) 761-8572 Ext.0012')).toEqual({ phone: '3367618572', phoneExtension: '0012' });
    expect(toPhone('(336) 744-0520 Ext.23225')).toEqual({ phone: '3367440520', phoneExtension: '23225' });
  });

  it('keeps numbers that are not 10 digits as written', () => {
    expect(toPhone('12345')).toEqual({ phone: '12345' });
  });

  it('returns nothing for blanks', () => {
    expect(toPhone('  ')).toEqual({});
  });
});

describe('missingColumns', () => {
  it('lists required columns that are absent', () => {
    expect(missingColumns(['agent', 'firstname'])).toEqual(REQUIRED_COLUMNS.filter((c) => !['agent', 'firstname'].includes(c)));
    expect(missingColumns(Object.keys(validRecord()))).toEqual([]);
  });
});

describe('normalizeRow', () => {
  it('maps a sheet row to the six collections', () => {
    const { value, error } = normalizeRow(validRecord(), 2);
    expect(error).toBeUndefined();
    expect(value.agent).toBe('Alex Watson');
    expect(value.lob).toBe('Commercial Auto');
    expect(value.carrier).toBe('Integon Gen Ins Corp');
    expect(value.user).toEqual({
      firstName: 'Lura Lucca',
      email: 'madler@yahoo.ca',
      dob: new Date('1960-02-11T00:00:00.000Z'),
      userType: 'Active Client',
      address: '170 MATTHIAS CT',
      city: 'MOCKSVILLE',
      state: 'NC',
      zip: '27028',
      phone: '8677356559',
    });
    expect(value.account).toEqual({ accountName: 'Lura Lucca & Owen Dodson', accountType: 'Commercial' });
    expect(value.policy).toEqual({
      policyNumber: 'YEEX9MOIBU7X',
      policyStartDate: new Date('2018-11-02T00:00:00.000Z'),
      policyEndDate: new Date('2019-11-02T00:00:00.000Z'),
      premiumAmount: 1180.83,
      policyMode: 12,
      policyType: 'Single',
      producer: 'Brandie Placencia',
      csr: 'Tami Ellison',
    });
  });

  it('omits blank optional cells so they never overwrite earlier values', () => {
    const { value } = normalizeRow({ ...validRecord(), address: '', city: '', state: '', zip: '', gender: '' }, 2);
    expect(value.user).not.toHaveProperty('address');
    expect(value.user).not.toHaveProperty('gender');
    expect(value.user).not.toHaveProperty('zip');
  });

  it('cleans the sheet quirks', () => {
    const { value } = normalizeRow({ ...validRecord(), zip: '27104-____', city: 'Winston Salem,' }, 2);
    expect(value.user.zip).toBe('27104');
    expect(value.user.city).toBe('Winston Salem');
  });

  it.each([
    ['policy_number', { policy_number: ' ' }, 'required'],
    ['firstname', { firstname: '' }, 'required'],
    ['email', { email: 'not-an-email' }, 'invalid email'],
    ['dob', { dob: '1960-02-30' }, 'expected YYYY-MM-DD'],
    ['policy_start_date', { policy_start_date: '02/11/2018' }, 'expected YYYY-MM-DD'],
    ['policy_end_date', { policy_end_date: '2017-01-01' }, 'before policy_start_date'],
    ['premium_amount', { premium_amount: 'abc' }, 'not a number'],
  ])('reports a bad %s', (field, patch, message) => {
    expect(normalizeRow({ ...validRecord(), ...patch }, 7)).toEqual({ error: { row: 7, field, message } });
  });
});
