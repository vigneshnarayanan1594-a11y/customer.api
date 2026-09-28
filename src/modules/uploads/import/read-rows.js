'use strict';

const fs = require('node:fs');
const { parse } = require('csv-parse');
const XLSX = require('xlsx');

const DATE_COLUMNS = new Set(['policy_start_date', 'policy_end_date', 'dob']);
const pad = (n) => String(n).padStart(2, '0');

// Excel date serial → 'YYYY-MM-DD' by pure arithmetic. Going through a JS Date (cellDates +
// toISOString) shifts every date back one day in zones east of UTC, e.g. Asia/Kolkata.
const serialToYmd = (serial) => {
  const { y, m, d } = XLSX.SSF.parse_date_code(serial);
  return `${y}-${pad(m)}-${pad(d)}`;
};

// Yields plain { header: string } records for both formats, so one normaliser serves both.
async function* readRows(filePath, ext) {
  if (ext === '.csv') {
    // Real RFC-4180 parsing: 5 rows of the sample quote values that contain commas.
    yield* fs.createReadStream(filePath).pipe(
      parse({ columns: true, bom: true, trim: true, skip_empty_lines: true }),
    );
    return;
  }

  let workbook;
  try {
    workbook = XLSX.readFile(filePath, { dense: true });       // no cellDates: dates stay numeric serials
  } catch (err) {
    throw Object.assign(new Error(`Could not read the XLSX file: ${err.message}`), { status: 422 });
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return;
  for (const record of XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })) {
    yield Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        typeof value === 'number' && DATE_COLUMNS.has(key) ? serialToYmd(value) : String(value),
      ]),
    );
  }
}

module.exports = { readRows, serialToYmd };
