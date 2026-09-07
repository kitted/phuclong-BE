import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Products } from '../../products/schemas/products.schema';
import { Trucks } from '../../trucks/schemas/trucks.schema';

export enum WarrantySourceType {
  WAREHOUSE = 'WAREHOUSE',
  TRUCK = 'TRUCK',
}

export enum WarrantyReturnStatus {
  RECEIVED = 'RECEIVED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum WarrantyResolution {
  RETURN_TO_SOURCE = 'RETURN_TO_SOURCE',
  RETURN_TO_WAREHOUSE = 'RETURN_TO_WAREHOUSE',
  DISPOSED = 'DISPOSED',
}

export class WarrantyReturnItem {
  @prop({ required: true, ref: () => Products }) productId: Ref<Products>;
  @prop({ required: true }) productCode: string;
  @prop({ required: true }) productName: string;
  @prop() imageUrl?: string;
  @prop() unit?: string;
  @prop({ required: true }) quantity: number;
  @prop({ required: true }) issue: string;
  @prop() serialNumber?: string;
  @prop() note?: string;
}

@index({ isDeleted: 1, createdAt: -1 })
@index({ sourceType: 1, status: 1, createdAt: -1 })
@index({ code: 1 }, { unique: true })
@index({ idempotencyKey: 1 }, { unique: true })
export class WarrantyReturns extends BaseModel {
  @prop({ required: true }) code: string;
  @prop({ required: true }) idempotencyKey: string;
  @prop({ required: true, enum: WarrantySourceType })
  sourceType: WarrantySourceType;
  @prop({ ref: () => Trucks }) sourceTruckId?: Ref<Trucks>;
  @prop() sourceTruckCode?: string;
  @prop() sourceTruckName?: string;
  @prop() sourceTruckLicensePlate?: string;
  @prop({ type: () => [WarrantyReturnItem], default: [] })
  items: WarrantyReturnItem[];
  @prop({ required: true }) totalQuantity: number;
  @prop() customerName?: string;
  @prop() customerPhone?: string;
  @prop() supplierName?: string;
  @prop({ required: true }) reason: string;
  @prop() note?: string;
  @prop({
    required: true,
    enum: WarrantyReturnStatus,
    default: WarrantyReturnStatus.RECEIVED,
  })
  status: WarrantyReturnStatus;
  @prop({ enum: WarrantyResolution }) resolution?: WarrantyResolution;
  @prop() resolutionNote?: string;
  @prop() completedAt?: Date;
  @prop() completedBy?: string;
  @prop() completedByName?: string;
  @prop() cancelledAt?: Date;
  @prop() cancelledBy?: string;
  @prop() cancelReason?: string;
  @prop() createdBy?: string;
  @prop() createdByName?: string;
}

@index({ key: 1 }, { unique: true })
export class WarrantyReturnCounters {
  @prop({ required: true }) key: string;
  @prop({ required: true, default: 0 }) sequence: number;
}
