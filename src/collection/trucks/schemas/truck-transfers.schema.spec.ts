import { buildSchema } from '@typegoose/typegoose';
import { TruckTransfers } from './truck-transfers.schema';
import { Trucks } from './trucks.schema';

describe('truck schemas', () => {
  it('enforces unique transfer codes', () => {
    expect(buildSchema(TruckTransfers).path('code').options.unique).toBe(true);
  });

  it('enforces unique truck code and license plate', () => {
    const schema = buildSchema(Trucks);
    expect(schema.path('code').options.unique).toBe(true);
    expect(schema.path('licensePlate').options.unique).toBe(true);
  });
});
