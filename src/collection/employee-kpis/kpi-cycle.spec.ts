import { monthlyKpiCycle } from './kpi-cycle';

describe('monthlyKpiCycle', () => {
  it.each([
    ['2026-08-09', '2026-07-10', '2026-08-09'],
    ['2026-08-10', '2026-08-10', '2026-09-09'],
    ['2026-01-05', '2025-12-10', '2026-01-09'],
  ])('uses 10–9 for %s', (anchor, fromText, toText) => {
    const period = monthlyKpiCycle(anchor);
    expect(period.fromText).toBe(fromText);
    expect(period.toText).toBe(toText);
  });
});
