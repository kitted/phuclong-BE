import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
export enum WarehouseInventoryBackupSource {
  STOCK_CHECK_SYNC = 'STOCK_CHECK_SYNC',
  BEFORE_RESTORE = 'BEFORE_RESTORE',
}
export class WarehouseInventoryBackupItem {
  @prop({ required: true }) productId: string;
  @prop() productCode?: string;
  @prop() productName?: string;
  @prop() unit?: string;
  @prop({ required: true, min: 0 }) quantity: number;
  @prop({ default: 0, min: 0 }) costPrice: number;
  @prop({ default: 0, min: 0 }) sellPrice: number;
}
@index({ createdAt: -1 })
@index({ code: 1 }, { unique: true })
@index({ restoreIdempotencyKey: 1 }, { unique: true, sparse: true })
export class WarehouseInventoryBackups extends BaseModel {
  @prop({ required: true }) code: string;
  @prop({ enum: WarehouseInventoryBackupSource, required: true })
  sourceType: WarehouseInventoryBackupSource;
  @prop() stockCheckId?: string;
  @prop({ type: () => [WarehouseInventoryBackupItem], default: [] })
  items: WarehouseInventoryBackupItem[];
  @prop({ required: true, min: 0 }) totalProducts: number;
  @prop({ required: true, min: 0 }) totalQuantity: number;
  @prop({ required: true, min: 0 }) totalCostValue: number;
  @prop({ required: true, min: 0 }) totalSellValue: number;
  @prop({ required: true }) checksum: string;
  @prop({ required: true }) reason: string;
  @prop() createdBy?: string;
  @prop() createdByName?: string;
  @prop() restoredAt?: Date;
  @prop() restoredBy?: string;
  @prop() restoreReason?: string;
  @prop() restoreIdempotencyKey?: string;
  @prop() restoreBackupId?: string;
}
export class WarehouseInventoryBackupCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ required: true, default: 0 }) sequence: number;
}
