import { distanceKm, summarizeRoute } from './sales-locations.service';

describe('sales route summary', () => {
  it('calculates distance and active capture duration', () => {
    const summary = summarizeRoute([
      { latitude: 10, longitude: 105, capturedAt: '2026-09-07T01:00:00Z' },
      { latitude: 10.001, longitude: 105, capturedAt: '2026-09-07T01:10:00Z' },
    ]);
    expect(summary.pointCount).toBe(2);
    expect(summary.durationMinutes).toBe(10);
    expect(summary.distanceKm).toBeGreaterThan(0.1);
    expect(distanceKm(summary.points[0], summary.points[1])).toBeLessThan(0.12);
  });

  it('breaks implausible or stale GPS segments', () => {
    const summary = summarizeRoute([
      { latitude: 10, longitude: 105, capturedAt: '2026-09-07T01:00:00Z' },
      { latitude: 11, longitude: 106, capturedAt: '2026-09-07T02:00:00Z' },
    ]);
    expect(summary.distanceKm).toBe(0);
    expect(summary.points[1].segment).toBe(1);
  });
});
