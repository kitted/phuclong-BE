import { buildCustomerInteractionImportKey, customerStoreProfileFlags, normalizePhones } from './customers.service';

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
