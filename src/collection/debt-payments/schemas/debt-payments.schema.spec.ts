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

  it('allows receipts for customers without a phone number', () => {
    expect(schema.path('customerPhone').options.required).not.toBe(true);
  });

  it('stores the part collected from opening/import debt without an invoice', () => {
    expect(schema.path('unallocatedAmount')).toBeDefined();
    expect(schema.path('unallocatedAmount').options.default).toBe(0);
  });

  it('indexes receipts by collector and newest date', () => {
    expect(schema.indexes()).toContainEqual([
      { collectorId: 1, date: -1 },
      { background: true },
    ]);
  });
});
