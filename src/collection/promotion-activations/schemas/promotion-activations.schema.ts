import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Promotions } from '../../promotions/schemas/promotions.schema';
import { Invoices } from '../../invoices/schemas/invoices.schema';
import { Customers } from '../../customers/schemas/customers.schema';
import { Users } from '../../users/schemas/users.schema';
import { Products } from '../../products/schemas/products.schema';
import { Trucks } from '../../trucks/schemas/trucks.schema';

export enum PromotionActivationStatus {
  ACTIVE = 'ACTIVE',
  USED = 'USED',
  CANCELLED = 'CANCELLED',
  REVOKED = 'REVOKED',
}
export enum PromotionActivationSource {
  INVOICE = 'INVOICE',
  MANUAL = 'MANUAL',
}
export enum PromotionStockSource {
  WAREHOUSE = 'WAREHOUSE',
  TRUCK = 'TRUCK',
}

@index({ promotionId: 1, customerId: 1, activatedAt: -1 })
@index({ salespersonId: 1, activatedAt: -1, status: 1 })
@index({ salespersonId: 1, promotionId: 1, status: 1, activatedAt: 1 })
export class PromotionActivations extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({
    enum: PromotionActivationSource,
    default: PromotionActivationSource.INVOICE,
  })
  source: PromotionActivationSource;
  @prop() customPrefix?: string;
  @prop({ ref: () => Promotions }) promotionId?: Ref<Promotions>;
  @prop() promotionCode?: string;
  @prop() promotionName?: string;
  @prop({ ref: () => Products }) productId?: Ref<Products>;
  @prop() productCode?: string;
  @prop() productName?: string;
  @prop({ default: 1, min: 1 }) giftQuantity: number;
  @prop({ enum: PromotionStockSource }) stockSource?: PromotionStockSource;
  @prop({ ref: () => Trucks }) sourceTruckId?: Ref<Trucks>;
  @prop() sourceTruckCode?: string;
  @prop() sourceTruckName?: string;
  @prop({ min: 0 }) availableQuantityAtCreation?: number;
  @prop({ default: false }) stockWarning?: boolean;
  @prop({ ref: () => Invoices, unique: true, sparse: true })
  invoiceId?: Ref<Invoices>;
  @prop() invoiceCode?: string;
  @prop({ ref: () => Customers, required: true }) customerId: Ref<Customers>;
  @prop() customerCode?: string;
  @prop({ required: true }) customerName: string;
  @prop() customerPhone?: string;
  @prop({ ref: () => Users, required: true }) salespersonId: Ref<Users>;
  @prop({ required: true }) salespersonCode: string;
  @prop({ required: true }) salespersonName: string;
  @prop({ required: true }) activatedAt: Date;
  @prop({
    enum: PromotionActivationStatus,
    default: PromotionActivationStatus.ACTIVE,
  })
  status: PromotionActivationStatus;
  @prop() statusReason?: string;
  @prop() statusChangedAt?: Date;
  @prop({ ref: () => Users }) statusChangedBy?: Ref<Users>;
  @prop() usedAt?: Date;
  @prop({ ref: () => Users }) createdBy?: Ref<Users>;
  @prop({ ref: () => Users }) updatedBy?: Ref<Users>;
}

export class PromotionActivationCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ default: 0 }) sequence: number;
}
