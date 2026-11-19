import { buildSchema } from '@typegoose/typegoose';
import { DocumentSafetyOperations } from './document-safety-operation.schema';

describe('DocumentSafetyOperations indexes', () => {
  it('defines the unique idempotency key index exactly once', () => {
    const indexes = buildSchema(DocumentSafetyOperations)
      .indexes()
      .filter(
        ([fields]) =>
          fields.idempotencyKey === 1 && Object.keys(fields).length === 1,
      );

    expect(indexes).toHaveLength(1);
    expect(indexes[0][1]).toMatchObject({ unique: true });
  });
});
