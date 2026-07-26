import { normalizePhones } from './customers.service';

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
