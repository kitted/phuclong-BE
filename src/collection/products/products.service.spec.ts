import { normalizeProductCode } from './products.service';

describe('product import code normalization', () => {
  it('trims, uppercases and removes whitespace', () => {
    expect(normalizeProductCode(' sen wu su kiez ')).toBe('SENWUSUKIEZ');
  });
});
