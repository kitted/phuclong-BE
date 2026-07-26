import { buildSchema } from '@typegoose/typegoose';
import { Customers } from './customers.schema';

describe('Customers phone schema', () => {
  const schema = buildSchema(Customers);

  it('allows the legacy display phone to be omitted', () => {
    expect(schema.path('phone').options.required).not.toBe(true);
  });

  it('stores normalized phones with non-unique search indexes', () => {
    expect(schema.path('phones')).toBeDefined();
    expect(schema.indexes()).toContainEqual([
      { phones: 1 },
      { background: true },
    ]);
  });
});
