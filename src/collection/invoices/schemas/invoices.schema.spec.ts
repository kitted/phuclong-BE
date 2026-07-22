import { buildSchema } from '@typegoose/typegoose';
import { Invoices } from './invoices.schema';

describe('Invoices financial schema', () => {
  const schema = buildSchema(Invoices);

  it('stores server-calculated totals and payment breakdown', () => {
    expect(schema.path('subtotal')).toBeDefined();
    expect(schema.path('discountAmount')).toBeDefined();
    expect(schema.path('grandTotal')).toBeDefined();
    expect(schema.path('payments')).toBeDefined();
  });

  it('requires the KPI salesperson snapshot', () => {
    expect(schema.path('salespersonId').options.required).toBe(true);
    expect(schema.path('salespersonCode').options.required).toBe(true);
    expect(schema.path('salespersonName').options.required).toBe(true);
  });
});
