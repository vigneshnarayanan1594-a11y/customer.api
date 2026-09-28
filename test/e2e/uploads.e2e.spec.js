'use strict';

const fs = require('node:fs');
const { SAMPLE_CSV, startTestApp, collectionCounts, csvToRealisticXlsx, tempFile } = require('./helpers');

const SAMPLE_COUNTS = { agents: 3, lobs: 19, carriers: 46, users: 1198, accounts: 1198, policies: 1198 };

describe('POST /api/uploads — Task 1.1', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await startTestApp();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const upload = (file) => ctx.http().post('/api/uploads').attach('file', file);

  it('imports the sample sheet into six collections', async () => {
    const res = await upload(SAMPLE_CSV).expect(200);

    expect(res.body).toMatchObject({ status: 'success', code: 200, msg: 'Import completed' });
    expect(res.body.data).toMatchObject({ file: 'sample.csv', rowsRead: 1198, rowsImported: 1198, rowsSkipped: 0, errors: [] });
    expect(res.body.data.collections).toEqual(
      Object.fromEntries(Object.entries(SAMPLE_COUNTS).map(([name, n]) => [name, { inserted: n, matched: 0 }])),
    );
    expect(await collectionCounts(ctx.connection)).toEqual(SAMPLE_COUNTS);
  });

  it('is idempotent: uploading the same sheet again creates nothing', async () => {
    const res = await upload(SAMPLE_CSV).expect(200);

    expect(res.body.data.collections).toEqual(
      Object.fromEntries(Object.entries(SAMPLE_COUNTS).map(([name, n]) => [name, { inserted: 0, matched: n }])),
    );
    expect(await collectionCounts(ctx.connection)).toEqual(SAMPLE_COUNTS);
  });

  it('reads the same data from an XLSX file with real date cells', async () => {
    const xlsx = csvToRealisticXlsx(SAMPLE_CSV, tempFile('sample.xlsx'));
    const res = await upload(xlsx).expect(200);

    expect(res.body.data).toMatchObject({ rowsImported: 1198, rowsSkipped: 0 });
    expect(res.body.data.collections.users).toEqual({ inserted: 0, matched: 1198 });
    expect(res.body.data.collections.policies).toEqual({ inserted: 0, matched: 1198 });
    const lura = await ctx.connection.collection('users').findOne({ firstName: 'Lura Lucca' });
    expect(lura.dob.toISOString()).toBe('1960-02-11T00:00:00.000Z');
  });

  it('normalises the quirks found in the sheet', async () => {
    const users = ctx.connection.collection('users');
    expect(await users.findOne({ firstName: 'Vergie Proctor' })).toMatchObject({ phone: '3367618572', phoneExtension: '0012' });
    expect(await users.countDocuments({ zip: /_/ })).toBe(0);
    expect(await users.countDocuments({ city: /,$/ })).toBe(0);
    expect(await users.countDocuments({ firstName: 'Kenneth Burton, Jr.' })).toBe(1);
    expect(await ctx.connection.collection('carriers').countDocuments({ companyName: 'The Bond Exchange, Inc.' })).toBe(1);
    // "Lura Lucca & Owen Dodson" is the account name of two different people.
    expect(await ctx.connection.collection('accounts').countDocuments({ accountName: 'Lura Lucca & Owen Dodson' })).toBe(2);
  });

  it('keeps the API responsive while an import runs on the worker thread', async () => {
    let uploadFinished = false;
    const pending = upload(SAMPLE_CSV).then((res) => {
      uploadFinished = true;
      return res;
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const health = await ctx.http().get('/health').expect(200);
    expect(health.body.data.db).toBe('up');
    expect(uploadFinished).toBe(false);
    expect((await pending).status).toBe(200);
  });

  it('skips and reports bad rows, importing the rest', async () => {
    const [header, first, second] = fs.readFileSync(SAMPLE_CSV, 'utf8').split(/\r?\n/);
    const file = tempFile('partial.csv');
    fs.writeFileSync(file, [header, first, second.replace('2018-11-09', '2019-02-30')].join('\n'));

    const res = await upload(file).expect(200);
    expect(res.body.data).toMatchObject({ rowsRead: 2, rowsImported: 1, rowsSkipped: 1 });
    expect(res.body.data.errors).toEqual([{ row: 3, field: 'policy_start_date', message: 'expected YYYY-MM-DD' }]);
  });

  it('rejects a sheet without the required columns', async () => {
    const file = tempFile('headers.csv');
    fs.writeFileSync(file, 'agent,firstname\nAlex Watson,Lura Lucca\n');

    const res = await upload(file).expect(400);
    expect(res.body).toMatchObject({ status: 'failed', code: 400 });
    expect(res.body.msg).toMatch(/^Missing required columns: userType, policy_number/);
  });

  it('rejects a sheet with no valid rows', async () => {
    const [header, first] = fs.readFileSync(SAMPLE_CSV, 'utf8').split(/\r?\n/);
    const file = tempFile('invalid.csv');
    fs.writeFileSync(file, [header, first.replace('madler@yahoo.ca', 'not-an-email')].join('\n'));

    const res = await upload(file).expect(422);
    expect(res.body.msg).toBe('No valid rows in file');
  });

  it('answers 422 for files that cannot be parsed', async () => {
    const [header] = fs.readFileSync(SAMPLE_CSV, 'utf8').split(/\r?\n/);
    const csv = tempFile('broken.csv');
    fs.writeFileSync(csv, `${header}\nAlex Watson,"unterminated quote\n`);
    expect((await upload(csv).expect(422)).body.msg).toMatch(/^Could not parse the CSV file/);

    const xlsx = tempFile('broken.xlsx');
    fs.writeFileSync(xlsx, Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(64, 7)]));   // truncated zip
    expect((await upload(xlsx).expect(422)).body.msg).toMatch(/^Could not read the XLSX file/);
  });

  it('rejects other file types and requests without a file', async () => {
    const file = tempFile('notes.txt');
    fs.writeFileSync(file, 'hello');
    expect((await upload(file).expect(400)).body.msg).toBe('Only .csv and .xlsx files are accepted');
    expect((await ctx.http().post('/api/uploads').expect(400)).body.msg).toMatch(/multipart\/form-data/);
  });
});

describe('POST /api/uploads — size limit', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await startTestApp({ UPLOAD_MAX_BYTES: '4096' });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('rejects files over UPLOAD_MAX_BYTES with 413', async () => {
    const res = await ctx.http().post('/api/uploads').attach('file', SAMPLE_CSV).expect(413);
    expect(res.body).toEqual({ status: 'failed', code: 413, msg: 'File is larger than 4096 bytes', data: {} });
    expect(await collectionCounts(ctx.connection)).toEqual({ agents: 0, lobs: 0, carriers: 0, users: 0, accounts: 0, policies: 0 });
  });
});
