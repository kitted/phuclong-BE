import { buildSchema } from '@typegoose/typegoose';
import { DailyReports } from './daily-reports.schema';

describe('DailyReports per-salesperson schema', () => {
  const schema = buildSchema(DailyReports);

  it('stores the salesperson identity snapshot', () => {
    expect(schema.path('salespersonId')).toBeDefined();
    expect(schema.path('salespersonCode')).toBeDefined();
    expect(schema.path('salespersonName')).toBeDefined();
    expect(schema.path('salespersonPhone')).toBeDefined();
  });

  it('allows one closed report per date and salesperson', () => {
    const index = schema
      .indexes()
      .find(
        ([fields]) => fields.reportDate === 1 && fields.salespersonId === 1,
      );
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
