import { InventoryStatus, resolveInventoryStatus } from './inventory-status';

describe('resolveInventoryStatus', () => {
  it('returns OUT_OF_STOCK for zero and negative quantities', () => {
    expect(resolveInventoryStatus(0, 10)).toBe(InventoryStatus.OUT_OF_STOCK);
    expect(resolveInventoryStatus(-1, 10)).toBe(InventoryStatus.OUT_OF_STOCK);
  });

  it('returns LOW_STOCK up to and including minStock', () => {
    expect(resolveInventoryStatus(1, 10)).toBe(InventoryStatus.LOW_STOCK);
    expect(resolveInventoryStatus(10, 10)).toBe(InventoryStatus.LOW_STOCK);
  });

  it('returns IN_STOCK above minStock', () => {
    expect(resolveInventoryStatus(11, 10)).toBe(InventoryStatus.IN_STOCK);
  });
});
