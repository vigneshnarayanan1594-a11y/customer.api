'use strict';

const { Dependencies, Injectable } = require('@nestjs/common');
const { getModelToken } = require('@nestjs/mongoose');
const { BaseRepository } = require('../base.repository');
const { ModelName } = require('../../schemas/model-names');
const { escapeRegExp } = require('../../utils/escape-regexp');

@Injectable()
@Dependencies(getModelToken(ModelName.User))
class UserRepository extends BaseRepository {
  constructor(model) {
    super(model);
  }

  // Case-insensitive substring match on the name. The input is escaped, so it's matched literally.
  async findIdsByNameContains(name) {
    const users = await this.model
      .find({ firstName: { $regex: escapeRegExp(name), $options: 'i' } }, { _id: 1 })
      .lean();
    return users.map((u) => u._id);
  }
}

module.exports = { UserRepository };
