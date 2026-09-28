'use strict';

const { Types } = require('mongoose');
const { SAMPLE_CSV, startTestApp } = require('./helpers');

describe('Policies — Task 1.2 search and Task 1.3 aggregation', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await startTestApp();
    await ctx.http().post('/api/uploads').attach('file', SAMPLE_CSV).expect(200);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const search = (query) => ctx.http().get('/api/policies/search').query(query);
  const aggregate = (query) => ctx.http().get('/api/policies/aggregate/by-user').query(query);

  describe('GET /api/policies/search', () => {
    it('finds policies by part of the user name, case-insensitively', async () => {
      for (const username of ['lura', 'LURA', 'Lura Lucca']) {
        const res = await search({ username }).expect(200);
        expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
        expect(res.body.data.policies[0]).toMatchObject({
          policyNumber: 'YEEX9MOIBU7X',
          policyStartDate: '2018-11-02T00:00:00.000Z',
          policyEndDate: '2019-11-02T00:00:00.000Z',
          premiumAmount: 1180.83,
          category: { categoryName: 'Commercial Auto' },
          carrier: { companyName: 'Integon Gen Ins Corp' },
          agent: { name: 'Alex Watson' },
          user: { firstName: 'Lura Lucca', email: 'madler@yahoo.ca' },
        });
      }
    });

    it('returns the policies of every matching user', async () => {
      const res = await search({ username: 'kenneth' }).expect(200);
      expect(res.body.data.policies.map((p) => p.user.firstName).sort()).toEqual([
        'Kenneth Burton, Jr.', 'Kenneth Caudill', 'Kenneth Frazelle', 'Kenneth Jones', 'Kenneth Shore', 'Kenneth Sizemore',
      ]);
    });

    it('paginates', async () => {
      const res = await search({ username: 'kenneth', limit: 2, page: 3 }).expect(200);
      expect(res.body.data.pagination).toEqual({ page: 3, limit: 2, total: 6, totalPages: 3 });
      expect(res.body.data.policies).toHaveLength(2);
    });

    it('matches the input literally (regex characters are escaped)', async () => {
      const res = await search({ username: '.*' }).expect(200);
      expect(res.body.data.pagination.total).toBe(0);
      expect(res.body.msg).toBe('No policies found');
    });

    it('validates the query', async () => {
      expect((await search({}).expect(400)).body.msg).toBe('username is required');
      expect((await search({ username: '   ' }).expect(400)).body.msg).toBe('username should not be empty');
      expect((await search({ username: 'a', limit: 500 }).expect(400)).body.msg).toBe('limit must not be greater than 100');
    });
  });

  describe('GET /api/policies/aggregate/by-user', () => {
    it('returns one entry per user, with premiums that add up to the sheet total', async () => {
      let sum = 0;
      let total = 0;
      for (let page = 1; ; page += 1) {
        const res = await aggregate({ page, limit: 100 }).expect(200);
        const { pagination, users } = res.body.data;
        total = pagination.total;
        sum += users.reduce((acc, user) => acc + user.totalPremium, 0);
        if (page >= pagination.totalPages) break;
      }
      expect(total).toBe(1198);
      expect(sum).toBeCloseTo(3339088.92, 1);
    });

    it('orders by policy count, then name (case-insensitive)', async () => {
      const res = await aggregate({ limit: 50 }).expect(200);
      const names = res.body.data.users.map((u) => u.firstName);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    });

    it('aggregates a single user', async () => {
      const lura = (await search({ username: 'lura' })).body.data.policies[0].user;
      const res = await aggregate({ userId: lura.id }).expect(200);
      expect(res.body.data.users).toEqual([
        {
          userId: lura.id,
          firstName: 'Lura Lucca',
          email: 'madler@yahoo.ca',
          policyCount: 1,
          totalPremium: 1180.83,
          firstPolicyStart: '2018-11-02T00:00:00.000Z',
          lastPolicyEnd: '2019-11-02T00:00:00.000Z',
          policies: [{
            policyNumber: 'YEEX9MOIBU7X',
            category: 'Commercial Auto',
            carrier: 'Integon Gen Ins Corp',
            policyStartDate: '2018-11-02T00:00:00.000Z',
            policyEndDate: '2019-11-02T00:00:00.000Z',
            premiumAmount: 1180.83,
          }],
        },
      ]);
    });

    it('groups several policies of the same user', async () => {
      // Every person in the sample holds one policy, so add two more for Lura Lucca.
      const policies = ctx.connection.collection('policies');
      const base = await policies.findOne({ policyNumber: 'YEEX9MOIBU7X' });
      await policies.insertMany([
        { ...base, _id: new Types.ObjectId(), policyNumber: 'TEST-0001', premiumAmount: 100.1, policyStartDate: new Date('2019-11-02') },
        { ...base, _id: new Types.ObjectId(), policyNumber: 'TEST-0002', premiumAmount: 200.2, policyStartDate: new Date('2020-11-02') },
      ]);

      const res = await aggregate({ userId: String(base.userId) }).expect(200);
      const [user] = res.body.data.users;
      expect(user.policyCount).toBe(3);
      expect(user.totalPremium).toBe(1481.13);
      expect(user.policies.map((p) => p.policyNumber)).toEqual(['TEST-0002', 'TEST-0001', 'YEEX9MOIBU7X']);
      expect((await search({ username: 'lura' })).body.data.pagination.total).toBe(3);
    });

    it('validates userId', async () => {
      expect((await aggregate({ userId: 'abc' }).expect(400)).body.msg).toBe('userId must be a mongodb id');
    });
  });
});
