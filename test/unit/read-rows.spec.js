'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const { readRows, serialToYmd } = require('../../src/modules/uploads/import/read-rows');

const collect = async (iterable) => {
  const rows = [];
  for await (const row of iterable) rows.push(row);
  return rows;
};

const excelSerial = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
};

describe('readRows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-rows-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('parses quoted CSV values that contain commas', async () => {
    const file = path.join(dir, 'quoted.csv');
    fs.writeFileSync(file, 'agent,company_name,firstname,city\r\nAlex,"The Bond Exchange, Inc.","Kenneth Burton, Jr.","Winston Salem,"\r\n');
    const rows = await collect(readRows(file, '.csv'));
    expect(rows).toEqual([
      { agent: 'Alex', company_name: 'The Bond Exchange, Inc.', firstname: 'Kenneth Burton, Jr.', city: 'Winston Salem,' },
    ]);
  });

  it('reads XLSX date cells as YYYY-MM-DD strings and numbers as strings', async () => {
    const file = path.join(dir, 'dates.xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([['dob', 'policy_start_date', 'premium_amount', 'phone']]);
    sheet.A2 = { t: 'n', v: excelSerial('1960-02-11'), z: 'm/d/yy' };
    sheet.B2 = { t: 'n', v: excelSerial('2018-11-02'), z: 'm/d/yy' };
    sheet.C2 = { t: 'n', v: 1180.83 };
    sheet.D2 = { t: 'n', v: 8677356559 };
    sheet['!ref'] = 'A1:D2';
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    XLSX.writeFile(book, file);

    const rows = await collect(readRows(file, '.xlsx'));
    expect(rows).toEqual([{ dob: '1960-02-11', policy_start_date: '2018-11-02', premium_amount: '1180.83', phone: '8677356559' }]);
  });
});

describe('serialToYmd', () => {
  const originalTz = process.env.TZ;
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  // cellDates + toISOString() is off by one day east of UTC; the serial arithmetic must not be.
  it.each(['UTC', 'Asia/Kolkata', 'Pacific/Auckland', 'America/New_York'])('is time-zone independent (%s)', (tz) => {
    process.env.TZ = tz;
    expect(serialToYmd(excelSerial('1960-02-11'))).toBe('1960-02-11');
    expect(serialToYmd(excelSerial('2019-12-31'))).toBe('2019-12-31');
  });
});
