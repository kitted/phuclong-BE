import { InvoiceLineType } from '../invoices/schemas/invoices.schema';
import { calculateCustomerCoinAwards } from './customer-coins.service';

describe('calculateCustomerCoinAwards', () => {
  it('awards one invoice coin per dong of grand total', () => {
    const result = calculateCustomerCoinAwards(2_000_000, [], []);
    expect(result.invoiceCoin).toBe(2_000_000);
  });

  it('only awards PlusEx coin for enabled sale lines', () => {
    const result = calculateCustomerCoinAwards(
      2_000_000,
      [
        {
          productId: 'a',
          productCode: 'A',
          productName: 'PlusEx A',
          qty: 2,
          lineTotal: 1_000_000,
          lineType: InvoiceLineType.SALE,
        },
        {
          productId: 'b',
          productCode: 'B',
          productName: 'Hàng thường',
          qty: 1,
          lineTotal: 500_000,
          lineType: InvoiceLineType.SALE,
        },
        {
          productId: 'a',
          productCode: 'A',
          productName: 'Quà PlusEx',
          qty: 1,
          lineTotal: 100_000,
          lineType: InvoiceLineType.GIFT,
        },
      ],
      ['a'],
    );
    expect(result.plusExCoin).toBe(1_000_000);
    expect(result.products).toHaveLength(1);
  });

  it('never creates negative coin awards', () => {
    const result = calculateCustomerCoinAwards(
      -10,
      [
        {
          productId: 'a',
          productCode: 'A',
          productName: 'A',
          qty: 1,
          lineTotal: -5,
          lineType: InvoiceLineType.SALE,
        },
      ],
      ['a'],
    );
    expect(result.invoiceCoin).toBe(0);
    expect(result.plusExCoin).toBe(0);
  });
});
