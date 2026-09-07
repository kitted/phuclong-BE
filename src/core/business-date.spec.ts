import { parseBusinessDate } from './business-date';

describe('parseBusinessDate', () => {
  it('keeps a selected date at Vietnam local midnight', () => {
    expect(parseBusinessDate('2026-09-05').toISOString()).toBe(
      '2026-09-04T17:00:00.000Z',
    );
  });

  it('removes the time from a full timestamp on another business day', () => {
    expect(
      parseBusinessDate(
        '2026-09-05T14:30:00+07:00',
        'Ngày',
        new Date('2026-09-07T03:00:00.000Z'),
        new Date('2026-09-07T03:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-09-04T17:00:00.000Z');
  });

  it('preserves the real time for a document created today', () => {
    expect(
      parseBusinessDate(
        '2026-09-07T14:30:00+07:00',
        'Ngày',
        new Date('2026-09-07T03:00:00.000Z'),
        new Date('2026-09-07T03:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-09-07T07:30:00.000Z');
  });

  it('uses the supplied fallback only when no date was selected', () => {
    const fallback = new Date('2026-09-07T03:00:00.000Z');
    expect(parseBusinessDate(undefined, 'Ngày', fallback)).toBe(fallback);
  });
});
