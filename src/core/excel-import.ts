export type ImportRow = Record<string, unknown>;

export function normalizeExcelHeader(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeExcelRow(row: ImportRow) {
  return Object.entries(row || {}).reduce<ImportRow>((result, [key, value]) => {
    result[normalizeExcelHeader(key)] = value;
    return result;
  }, {});
}

export function excelValue(row: ImportRow, aliases: string[], fallback: unknown = '') {
  for (const alias of aliases) {
    const value = row[normalizeExcelHeader(alias)];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

export function excelNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function excelBoolean(value: unknown) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('vi');
  return ['true', '1', 'yes', 'y', 'co', 'có', 'da', 'đã', 'x'].includes(normalized);
}
