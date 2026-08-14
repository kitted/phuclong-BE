import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
export enum GoodsAdvanceStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}
export class GoodsAdvanceItem {
  @prop({ required: true }) productId: string;
  @prop({ required: true }) productCode: string;
  @prop({ required: true }) productName: string;
  @prop() unit?: string;
  @prop({ required: true, min: 1 }) quantity: number;
  @prop() note?: string;
}
@index({ code: 1 }, { unique: true })
@index({ date: -1, status: 1 })
export class GoodsAdvances extends BaseModel {
  @prop({ required: true }) code: string;
  @prop({ required: true }) date: Date;
  @prop({ required: true }) employeeId: string;
  @prop() employeeCode?: string;
  @prop({ required: true }) employeeName: string;
  @prop({ required: true }) truckId: string;
  @prop({ required: true }) truckCode: string;
  @prop({ required: true }) truckName: string;
  @prop() truckLicensePlate?: string;
  @prop({ type: () => [GoodsAdvanceItem], default: [] })
  items: GoodsAdvanceItem[];
  @prop() note?: string;
  @prop() issues?: string;
  @prop() warehouseIssuerName?: string;
  @prop() advanceRecipientName?: string;
  @prop({ enum: GoodsAdvanceStatus, default: GoodsAdvanceStatus.DRAFT })
  status: GoodsAdvanceStatus;
  @prop() createdBy?: string;
  @prop() confirmedAt?: Date;
  @prop() confirmedBy?: string;
  @prop() cancelledAt?: Date;
  @prop() cancelledBy?: string;
  @prop() cancelReason?: string;
}
export class GoodsAdvanceCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ required: true, default: 0 }) sequence: number;
}
