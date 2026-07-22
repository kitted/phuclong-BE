import { buildSchema } from '@typegoose/typegoose';
import { DebtPayments } from './debt-payments.schema';

describe('DebtPayments responsibility snapshot', () => {
  const schema = buildSchema(DebtPayments);

  it('requires the collector identity snapshot', () => {
    expect(schema.path('collectorId').options.required).toBe(true);
    expect(schema.path('collectorName').options.required).toBe(true);
    expect(schema.path('collectorCode')).toBeDefined();
    expect(schema.path('createdByRole')).toBeDefined();
  });

  it('indexes receipts by collector and newest date', () => {
    expect(schema.indexes()).toContainEqual([
      { collectorId: 1, date: -1 },
      { background: true },
    ]);
  });
});
