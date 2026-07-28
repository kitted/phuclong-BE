import { buildSchema } from '@typegoose/typegoose';
import { Customers } from './customers.schema';

describe('Customers phone schema', () => {
  const schema = buildSchema(Customers);

  it('allows the legacy display phone to be omitted', () => {
    expect(schema.path('phone').options.required).not.toBe(true);
  });

  it('allows unassigned codes and keeps active assigned codes unique', () => {
    expect(schema.path('code').options.required).not.toBe(true);
    expect(schema.path('codeStatus')).toBeDefined();
    expect(schema.path('codeHistory')).toBeDefined();
    expect(schema.indexes()).toContainEqual([
      { code: 1 },
      {
        unique: true,
        partialFilterExpression: { isDeleted: false, code: { $type: 'string' } },
        background: true,
      },
    ]);
  });

  it('stores normalized phones with non-unique search indexes', () => {
    expect(schema.path('phones')).toBeDefined();
    expect(schema.indexes()).toContainEqual([
      { phones: 1 },
      { background: true },
    ]);
  });

  it('stores imported interaction snapshots and idempotency key', () => {
    expect(schema.path('interactions').schema.path('zaloStatus')).toBeDefined();
    expect(schema.path('interactions').schema.path('invoiceStatus')).toBeDefined();
    expect(schema.path('interactions').schema.path('occurredAt')).toBeDefined();
    expect(schema.path('interactions').schema.path('importKey')).toBeDefined();
  });

  it('stores storefront location as GeoJSON and indexes it', () => {
    expect(schema.path('storeLocation.latitude')).toBeDefined();
    expect(schema.path('storeLocation.longitude')).toBeDefined();
    expect(schema.path('storeLocation.geo.type')).toBeDefined();
    expect(schema.path('storeLocation.geo.coordinates')).toBeDefined();
    expect(schema.indexes()).toContainEqual([
      { 'storeLocation.geo': '2dsphere' },
      { background: true },
    ]);
  });

  it('stores the Cloudinary storefront image snapshot', () => {
    expect(schema.path('storefrontImage.url')).toBeDefined();
    expect(schema.path('storefrontImage.publicId')).toBeDefined();
    expect(schema.path('storefrontImage.uploadedBy')).toBeDefined();
  });
});
