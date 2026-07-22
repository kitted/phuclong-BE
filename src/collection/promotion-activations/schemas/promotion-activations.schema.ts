import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Promotions } from '../../promotions/schemas/promotions.schema';
import { Invoices } from '../../invoices/schemas/invoices.schema';
import { Customers } from '../../customers/schemas/customers.schema';
import { Users } from '../../users/schemas/users.schema';

export enum PromotionActivationStatus { ACTIVE = 'ACTIVE', CANCELLED = 'CANCELLED', REVOKED = 'REVOKED' }

@index({ promotionId: 1, customerId: 1, activatedAt: -1 })
@index({ salespersonId: 1, activatedAt: -1, status: 1 })
@index({ salespersonId: 1, promotionId: 1, status: 1, activatedAt: 1 })
export class PromotionActivations extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ ref: () => Promotions, required: true }) promotionId: Ref<Promotions>;
  @prop({ required: true }) promotionCode: string;
  @prop({ required: true }) promotionName: string;
  @prop({ ref: () => Invoices, required: true, unique: true }) invoiceId: Ref<Invoices>;
  @prop({ required: true }) invoiceCode: string;
  @prop({ ref: () => Customers, required: true }) customerId: Ref<Customers>;
  @prop({ required: true }) customerCode: string;
  @prop({ required: true }) customerName: string;
  @prop({ required: true }) customerPhone: string;
  @prop({ ref: () => Users, required: true }) salespersonId: Ref<Users>;
  @prop({ required: true }) salespersonCode: string;
  @prop({ required: true }) salespersonName: string;
  @prop({ required: true }) activatedAt: Date;
  @prop({ enum: PromotionActivationStatus, default: PromotionActivationStatus.ACTIVE }) status: PromotionActivationStatus;
  @prop() statusReason?: string;
  @prop() statusChangedAt?: Date;
  @prop({ ref: () => Users }) statusChangedBy?: Ref<Users>;
}

export class PromotionActivationCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ default: 0 }) sequence: number;
}
