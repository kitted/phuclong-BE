import { buildSchema } from '@typegoose/typegoose';
import { Users, UserStatus } from './users.schema';

describe('Users schema security', () => {
  const schema = buildSchema(Users);

  it('excludes password from queries unless explicitly selected', () => {
    expect(schema.path('password').options.select).toBe(false);
  });

  it('creates active accounts by default', () => {
    expect(schema.path('status').options.default).toBe(UserStatus.ACTIVE);
  });
});
