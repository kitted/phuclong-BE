import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
export enum WarehouseStockCheckStatus {
  MATCHED = 'MATCHED',
  SHORTAGE = 'SHORTAGE',
  SURPLUS = 'SURPLUS',
  NOT_COUNTED = 'NOT_COUNTED',
  UNKNOWN = 'UNKNOWN',
  INVALID = 'INVALID',
}
export class WarehouseStockCheckItem {
  @prop() productId?: string;
  @prop() productCode?: string;
  @prop() productName?: string;
  @prop() unit?: string;
  @prop({ min: 0 }) systemQuantity?: number;
  @prop({ min: 0 }) actualQuantity?: number;
  @prop() differenceQuantity?: number;
  @prop({ enum: WarehouseStockCheckStatus, required: true })
  status: WarehouseStockCheckStatus;
  @prop() note?: string;
  @prop() rowNumber?: number;
}
@index({ comparedAt: -1 })
@index({ syncIdempotencyKey: 1 }, { unique: true, sparse: true })
export class WarehouseStockChecks extends BaseModel {
  @prop({ required: true }) comparedAt: Date;
  @prop({ type: () => [WarehouseStockCheckItem], default: [] })
  items: WarehouseStockCheckItem[];
  @prop() summary: Record<string, number>;
  @prop() createdBy?: string;
  @prop() sourceFileName?: string;
  @prop() syncedAt?: Date;
  @prop() syncedBy?: string;
  @prop() syncReason?: string;
  @prop() syncIdempotencyKey?: string;
  @prop() backupId?: string;
}
