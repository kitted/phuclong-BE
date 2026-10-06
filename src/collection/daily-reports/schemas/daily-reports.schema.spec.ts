import { buildSchema } from '@typegoose/typegoose';
import { DailyReports } from './daily-reports.schema';

describe('DailyReports per-truck schema', () => {
  const schema = buildSchema(DailyReports);

  it('stores the truck identity snapshot', () => {
    expect(schema.path('truckId')).toBeDefined();
    expect(schema.path('truckCode')).toBeDefined();
    expect(schema.path('truckName')).toBeDefined();
    expect(schema.path('truckLicensePlate')).toBeDefined();
    expect(schema.path('driverName')).toBeDefined();
  });

  it('allows one closed report per date and truck', () => {
    const index = schema
      .indexes()
      .find(([fields]) => fields.reportDate === 1 && fields.truckId === 1);
    expect(index?.[1]).toMatchObject({ unique: true });
    expect(
      schema
        .indexes()
        .some(
          ([fields, options]) =>
            fields.reportDate === 1 &&
            Object.keys(fields).length === 1 &&
            options.unique,
        ),
    ).toBe(false);
  });
});
