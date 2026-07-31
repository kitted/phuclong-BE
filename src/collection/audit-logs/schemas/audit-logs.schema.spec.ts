import { buildSchema } from '@typegoose/typegoose';
import { AuditLogs } from './audit-logs.schema';

describe('AuditLogs indexes', () => {
  it('declares correlationId as one unique index only', () => {
    const schema = buildSchema(AuditLogs);
    const indexes = schema.indexes().filter(([keys]) => keys.correlationId === 1);
    expect(indexes).toHaveLength(1);
    expect(indexes[0][1].unique).toBe(true);
  });
});
