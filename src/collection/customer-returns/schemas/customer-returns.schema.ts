import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

export enum ReturnItemType { CATALOG = 'CATALOG', MANUAL = 'MANUAL' }
export enum ReturnCondition { GOOD = 'GOOD', DAMAGED = 'DAMAGED', EXPIRED = 'EXPIRED', UNKNOWN = 'UNKNOWN' }
export enum RefundMethod { CASH = 'CASH', BANK_TRANSFER = 'BANK_TRANSFER' }
export enum CustomerReturnStatus { COMPLETED = 'COMPLETED', REVERSED = 'REVERSED' }
export enum UnclassifiedStatus { UNCLASSIFIED = 'UNCLASSIFIED', MAPPED = 'MAPPED', DISPOSED = 'DISPOSED' }

export class CustomerReturnItem {
  @prop({ required: true }) lineId: string;
  @prop({ enum: ReturnItemType, required: true }) itemType: ReturnItemType;
  @prop() productId?: string; @prop() productCode?: string; @prop() productName?: string; @prop() unit?: string;
  @prop() manualCode?: string; @prop() manualName?: string; @prop() manualUnit?: string;
  @prop({ required: true, min: 1 }) qty: number;
  @prop({ min: 0 }) previousUnitPrice?: number;
  @prop({ required: true, min: 0 }) returnUnitPrice: number;
  @prop({ required: true, min: 0 }) lineReturnAmount: number;
  @prop() priceDifference?: number;
  @prop({ enum: ReturnCondition, required: true }) condition: ReturnCondition;
  @prop() note?: string;
  @prop() unclassifiedStockId?: string;
}
export class ReturnRefund { @prop({ enum: RefundMethod, required: true }) method: RefundMethod; @prop({ required: true, min: 0 }) amount: number; @prop() referenceCode?: string; }

@index({ code: 1 }, { unique: true }) @index({ idempotencyKey: 1 }, { unique: true }) @index({ createdAt: -1 })
export class CustomerReturns extends BaseModel {
  @prop({ required: true }) code: string; @prop({ required: true }) idempotencyKey: string;
  @prop({ required: true }) customerId: string; @prop() customerCode?: string; @prop({ required: true }) customerName: string; @prop() customerPhone?: string;
  @prop({ required: true }) destinationTruckId: string; @prop({ required: true }) destinationTruckCode: string; @prop({ required: true }) destinationTruckName: string; @prop() destinationTruckLicensePlate?: string; @prop() driverId?: string; @prop() driverName?: string;
  @prop({ type: () => [CustomerReturnItem], required: true }) items: CustomerReturnItem[];
  @prop({ required: true, min: 0 }) returnAmount: number; @prop({ min: 0 }) previousReferenceAmount?: number; @prop() priceDifferenceAmount?: number;
  @prop({ required: true, min: 0 }) debtReductionAmount: number; @prop({ required: true, min: 0 }) refundAmount: number;
  @prop({ type: () => [ReturnRefund], default: [] }) refunds: ReturnRefund[];
  @prop({ required: true, min: 0 }) customerDebtBefore: number; @prop({ required: true, min: 0 }) customerDebtAfter: number;
  @prop() reason?: string; @prop() priceAdjustmentReason?: string; @prop() note?: string;
  @prop({ enum: CustomerReturnStatus, default: CustomerReturnStatus.COMPLETED }) status: CustomerReturnStatus;
  @prop({ required: true }) createdBy: string; @prop() reversedBy?: string; @prop() reversedAt?: Date; @prop() reversalReason?: string;
  @prop({ min: 0 }) refundRecoveryAmount?: number; @prop({ enum: ['REQUIRES_COLLECTION', 'COLLECTED'] }) refundRecoveryStatus?: string;
}
export class CustomerReturnCounters { @prop({ required: true, unique: true }) key: string; @prop({ required: true, default: 0 }) sequence: number; }

@index({ truckId: 1, status: 1, createdAt: -1 })
export class TruckUnclassifiedReturnStock extends BaseModel {
  @prop({ required: true }) truckId: string; @prop() manualCode?: string; @prop({ required: true }) name: string; @prop({ required: true }) normalizedName: string; @prop({ required: true }) unit: string;
  @prop({ required: true, min: 0 }) quantity: number; @prop({ min: 0 }) referenceUnitPrice?: number; @prop({ required: true, min: 0 }) returnUnitPrice: number; @prop({ required: true, min: 0 }) totalReturnValue: number;
  @prop({ enum: ReturnCondition, required: true }) condition: ReturnCondition; @prop({ type: () => [String], default: [] }) sourceReturnIds: string[];
  @prop({ enum: UnclassifiedStatus, default: UnclassifiedStatus.UNCLASSIFIED }) status: UnclassifiedStatus; @prop() mappedProductId?: string;
}
