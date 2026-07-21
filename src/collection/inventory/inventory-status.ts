export enum InventoryStatus {
  ALL = 'ALL',
  IN_STOCK = 'IN_STOCK',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

export function resolveInventoryStatus(quantity: number, minStock: number) {
  if (quantity <= 0) return InventoryStatus.OUT_OF_STOCK;
  if (quantity <= minStock) return InventoryStatus.LOW_STOCK;
  return InventoryStatus.IN_STOCK;
}
