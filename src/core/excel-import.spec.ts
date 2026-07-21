import { excelBoolean, excelNumber, excelValue, normalizeExcelRow } from './excel-import';

describe('excel import helpers', () => {
  it('matches Vietnamese and English headers without accents or punctuation', () => {
    const row = normalizeExcelRow({ 'Số điện thoại': '0901234567', 'Gia nhap': '12,500' });
    expect(excelValue(row, ['So dien thoai'])).toBe('0901234567');
    expect(excelNumber(excelValue(row, ['Giá nhập']))).toBe(12500);
  });

  it('parses common Vietnamese boolean values', () => {
    expect(excelBoolean('Có')).toBe(true);
    expect(excelBoolean('Đã')).toBe(true);
    expect(excelBoolean('Không')).toBe(false);
  });

  it('keeps a leading-zero phone as text', () => {
    const row = normalizeExcelRow({ phone: '0901234567' });
    expect(String(excelValue(row, ['Số điện thoại', 'phone']))).toBe('0901234567');
  });
});
