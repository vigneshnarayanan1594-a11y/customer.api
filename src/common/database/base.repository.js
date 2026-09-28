'use strict';

const { toPagination } = require('../dto/pagination-query.dto');

// Generic data access over one owned collection. Repositories hold queries only — no business logic.
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  findById(id, projection) {
    return this.model.findById(id, projection).lean();
  }

  findOne(filter, projection) {
    return this.model.findOne(filter, projection).lean();
  }

  find(filter, { projection, sort, skip, limit } = {}) {
    const query = this.model.find(filter, projection);
    if (sort) query.sort(sort);
    if (skip) query.skip(skip);
    if (limit) query.limit(limit);
    return query.lean();
  }

  async findPaginated(filter, { page = 1, limit = 20, sort = { _id: -1 }, projection } = {}) {
    const [total, items] = await Promise.all([
      this.model.countDocuments(filter),
      this.model.find(filter, projection).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return { items, pagination: toPagination({ page, limit }, total) };
  }

  async create(doc) {
    const created = await this.model.create(doc);
    return created.toObject();
  }

  aggregate(pipeline) {
    return this.model.aggregate(pipeline);
  }

  count(filter = {}) {
    return this.model.countDocuments(filter);
  }

  async exists(filter) {
    return Boolean(await this.model.exists(filter));
  }
}

module.exports = { BaseRepository };
