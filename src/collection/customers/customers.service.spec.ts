import {
  buildCustomerInteractionImportKey,
  customerStoreProfileFlags,
  CustomersService,
  normalizePhones,
} from './customers.service';

const selectSortLean = (value: unknown) => ({
  select: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
  }),
});

const selectLean = (value: unknown) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value),
  }),
});

const sortLean = (value: unknown) => ({
  sort: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value),
  }),
});

const lean = (value: unknown) => ({
  lean: jest.fn().mockResolvedValue(value),
});

describe('customer phone normalization', () => {
  it('normalizes separators, prefixes and duplicate numbers', () => {
    expect(normalizePhones('901234567; 0912345678 | 901234567')).toEqual([
      '0901234567',
      '0912345678',
    ]);
  });

  it('allows customers without a phone number', () => {
    expect(normalizePhones(undefined)).toEqual([]);
    expect(normalizePhones('')).toEqual([]);
  });
});

describe('customer interaction import key', () => {
  it('is stable for retries of the same original Excel row', () => {
    const row: any = { rowNumber: 2, customerCode: 'KH253', zaloStatus: 'NOT_CONNECTED', invoiceStatus: 'NOT_SENT', interaction: '', phone: '0975280609', note: 'khách khó', occurredAt: '2026-07-24T12:00:00+07:00' };
    const date = new Date(row.occurredAt);
    expect(buildCustomerInteractionImportKey(row, 'KH253', date, row.phone)).toBe(buildCustomerInteractionImportKey(row, 'KH253', date, row.phone));
  });
});

describe('customer store profile list flags', () => {
  it('returns true when both coordinates and the image URL are available', () => {
    expect(customerStoreProfileFlags({
      storeLocation: { latitude: 0, longitude: 106.7 },
      storefrontImage: { url: 'https://example.com/store.jpg' },
    })).toEqual({ hasStoreLocation: true, hasStorefrontImage: true });
  });

  it('does not mark incomplete store profile data as available', () => {
    expect(customerStoreProfileFlags({
      storeLocation: { latitude: 10.7 },
      storefrontImage: {},
    })).toEqual({ hasStoreLocation: false, hasStorefrontImage: false });
  });
});

describe('daily invoice follow-up customer return dates', () => {
  it('filters and displays customer returns by business date, not createdAt', async () => {
    const service: any = Object.create(CustomersService.prototype);
    const returnDate = new Date('2026-10-06T02:00:00.000Z');
    service.invoiceModel = {
      find: jest.fn().mockReturnValue(selectSortLean([])),
    };
    service.debtPaymentModel = {
      find: jest.fn().mockReturnValue(selectSortLean([])),
    };
    service.customerReturnModel = {
      find: jest.fn().mockReturnValue(
        selectSortLean([
          {
            _id: '507f191e810c19729de860ea',
            code: 'HHT-261006-000001',
            date: returnDate,
            createdAt: new Date('2026-10-07T02:00:00.000Z'),
            customerName: 'Khách hàng A',
            returnAmount: 100000,
          },
        ]),
      ),
    };
    service.model = { find: jest.fn().mockReturnValue(selectLean([])) };
    service.invoiceFollowUpDraftModel = {
      find: jest.fn().mockReturnValue(sortLean([])),
    };
    service.invoiceFollowUpBookModel = {
      findOne: jest.fn().mockReturnValue(lean(null)),
    };

    const result = await service.dailyInvoiceFollowUps({ date: '2026-10-06' });
    const query = service.customerReturnModel.find.mock.calls[0][0];

    expect(query.date).toEqual({
      $gte: expect.any(Date),
      $lte: expect.any(Date),
    });
    expect(query).not.toHaveProperty('createdAt');
    expect(result.data).toContainEqual(
      expect.objectContaining({
        documentType: 'CUSTOMER_RETURN',
        invoiceDate: returnDate,
      }),
    );
  });
});
