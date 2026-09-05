import {
  normalizeProductCode,
  parseProductImportRow,
} from './products.service';

describe('product import code normalization', () => {
  it('trims, uppercases and removes whitespace', () => {
    expect(normalizeProductCode(' sen wu su kiez ')).toBe('SENWUSUKIEZ');
  });
});

describe('product Excel import rows', () => {
  it('reads the canonical export headers and marks legacy stock as ignored', () => {
    expect(
      parseProductImportRow({
        'Mã sản phẩm (*)': ' sp 01 ',
        'Tên sản phẩm (*)': 'Sản phẩm 01',
        'Giá nhập': '12,500',
        'Tồn tối thiểu': '3',
        'Tồn kho hiện tại (CHỈ XEM)': '99',
      }),
    ).toMatchObject({
      code: 'SP01',
      name: 'Sản phẩm 01',
      costPrice: 12500,
      minStock: 3,
      stockWasProvided: true,
    });
  });

  it('rejects malformed prices instead of silently converting them to zero', () => {
    expect(() =>
      parseProductImportRow({
        'Mã sản phẩm': 'SP01',
        'Tên sản phẩm': 'Sản phẩm 01',
        'Giá bán': 'mười nghìn',
      }),
    ).toThrow('Giá bán phải là số lớn hơn hoặc bằng 0');
  });

  it('rejects a fractional minimum stock', () => {
    expect(() =>
      parseProductImportRow({
        'Mã sản phẩm': 'SP01',
        'Tên sản phẩm': 'Sản phẩm 01',
        'Tồn tối thiểu': '1.5',
      }),
    ).toThrow('Tồn tối thiểu phải là số nguyên');
  });
});
