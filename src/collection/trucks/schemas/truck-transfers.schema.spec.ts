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

  it('allows one active truck assignment per driver', () => {
    const indexes = buildSchema(Trucks).indexes();
    const driverIndex = indexes.find(([fields]) => fields.driverId === 1);
    expect(driverIndex?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { driverId: { $type: 'objectId' }, isDeleted: false },
    });
  });
});
