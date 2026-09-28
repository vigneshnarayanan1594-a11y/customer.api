'use strict';

const { ModelName } = require('./model-names');
const { AgentSchema } = require('./models/agent.schema');
const { LobSchema } = require('./models/lob.schema');
const { CarrierSchema } = require('./models/carrier.schema');
const { UserSchema } = require('./models/user.schema');
const { AccountSchema } = require('./models/account.schema');
const { PolicySchema } = require('./models/policy.schema');
const { ScheduledMessageSchema } = require('./models/scheduled-message.schema');
const { MessageSchema } = require('./models/message.schema');

// Shared by SchemasModule (MongooseModule.forFeature) and the import worker thread (conn.model).
const MODEL_DEFINITIONS = Object.freeze([
  { name: ModelName.Agent, schema: AgentSchema },
  { name: ModelName.Lob, schema: LobSchema },
  { name: ModelName.Carrier, schema: CarrierSchema },
  { name: ModelName.User, schema: UserSchema },
  { name: ModelName.Account, schema: AccountSchema },
  { name: ModelName.Policy, schema: PolicySchema },
  { name: ModelName.ScheduledMessage, schema: ScheduledMessageSchema },
  { name: ModelName.Message, schema: MessageSchema },
]);

module.exports = { MODEL_DEFINITIONS };
