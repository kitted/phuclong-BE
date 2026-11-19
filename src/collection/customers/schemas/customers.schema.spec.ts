import { buildSchema } from '@typegoose/typegoose';
import { InvoiceFollowUpBooks } from './customers.schema';

describe('InvoiceFollowUpBooks indexes', () => {
  it('defines the unique date index exactly once', () => {
    const indexes = buildSchema(InvoiceFollowUpBooks)
      .indexes()
      .filter(
        ([fields]) => fields.date === 1 && Object.keys(fields).length === 1,
      );

    expect(indexes).toHaveLength(1);
    expect(indexes[0][1]).toMatchObject({ unique: true });
  });
});
