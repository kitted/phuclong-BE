import { vietnamDateBoundary } from './truck-transfer-date';

describe('Vietnam truck transfer date boundaries', () => {
  it('converts a Vietnam business day to UTC boundaries', () => {
    expect(vietnamDateBoundary('2026-07-22', false).toISOString()).toBe('2026-07-21T17:00:00.000Z');
    expect(vietnamDateBoundary('2026-07-22', true).toISOString()).toBe('2026-07-22T16:59:59.999Z');
  });

  it('keeps an explicit timezone instant unchanged', () => {
    expect(vietnamDateBoundary('2026-07-22T08:30:00+07:00', false).toISOString()).toBe('2026-07-22T01:30:00.000Z');
  });
});
