'use strict';

const ModelName = Object.freeze({
  Agent: 'Agent',
  Lob: 'LOB',
  Carrier: 'Carrier',
  User: 'User',
  Account: 'Account',
  Policy: 'Policy',
  ScheduledMessage: 'ScheduledMessage',
  Message: 'Message',
});

// Explicit collection names, so $lookup.from never depends on Mongoose pluralisation.
const CollectionName = Object.freeze({
  Agent: 'agents',
  Lob: 'lobs',
  Carrier: 'carriers',
  User: 'users',
  Account: 'accounts',
  Policy: 'policies',
  ScheduledMessage: 'scheduled_messages',
  Message: 'messages',
});

module.exports = { ModelName, CollectionName };
