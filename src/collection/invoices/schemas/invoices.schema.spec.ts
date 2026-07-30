import { buildSchema } from '@typegoose/typegoose';
import { Invoices } from './invoices.schema';

describe('Invoices financial schema', () => {
  const schema = buildSchema(Invoices);

  it('stores server-calculated totals and payment breakdown', () => {
    expect(schema.path('subtotal')).toBeDefined();
    expect(schema.path('discountAmount')).toBeDefined();
    expect(schema.path('grandTotal')).toBeDefined();
    expect(schema.path('payments')).toBeDefined();
    expect(schema.path('receivedAmount')).toBeDefined();
    expect(schema.path('existingDebtPaidAmount')).toBeDefined();
    expect(schema.path('customerDebtBefore')).toBeDefined();
    expect(schema.path('customerDebtAfter')).toBeDefined();
    expect(schema.path('debtPaymentCode')).toBeDefined();
    expect(schema.path('giftCode')).toBeDefined();
    expect(schema.path('items')).toBeDefined();
  });

  it('requires the KPI salesperson snapshot', () => {
    expect(schema.path('salespersonId').options.required).toBe(true);
    expect(schema.path('salespersonCode').options.required).toBe(true);
    expect(schema.path('salespersonName').options.required).toBe(true);
  });

  it('stores the customer identity snapshot even when the code is unassigned', () => {
    expect(schema.path('customerCode').options.required).not.toBe(true);
    expect(schema.path('customerCodeStatus')).toBeDefined();
    expect(schema.path('customerName')).toBeDefined();
    expect(schema.path('customerPhone')).toBeDefined();
  });

  it('stores catalog and effective price independently for every sale line', () => {
    const itemSchema = (schema.path('items') as any).schema;
    expect(itemSchema.path('catalogPrice')).toBeDefined();
    expect(itemSchema.path('price')).toBeDefined();
    expect(itemSchema.path('priceOverridden')).toBeDefined();
    expect(itemSchema.path('unitPriceOverride')).toBeDefined();
    expect(itemSchema.path('priceOverriddenBy')).toBeDefined();
  });
});
