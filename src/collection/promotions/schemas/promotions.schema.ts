import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Categories } from '../../categories/schemas/categories.schema';
import { Products } from '../../products/schemas/products.schema';
import { Customers } from '../../customers/schemas/customers.schema';
import { Types } from 'mongoose';

export enum PromotionType { VOUCHER = 'VOUCHER', AUTO_DISCOUNT = 'AUTO_DISCOUNT' }
export enum DiscountType { PERCENT = 'PERCENT', FIXED = 'FIXED' }
export enum PromotionScope { ALL = 'ALL', CATEGORY = 'CATEGORY', PRODUCT_TYPE = 'PRODUCT_TYPE', PRODUCTS = 'PRODUCTS' }
export enum PromotionStatus { DRAFT = 'DRAFT', SCHEDULED = 'SCHEDULED', ACTIVE = 'ACTIVE', PAUSED = 'PAUSED', ENDED = 'ENDED' }
export enum VoucherStatus { ACTIVE = 'ACTIVE', USED = 'USED', EXPIRED = 'EXPIRED', REVOKED = 'REVOKED' }

export class Promotions extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ required: true }) name: string;
  @prop({ enum: PromotionType, required: true }) type: PromotionType;
  @prop({ enum: DiscountType, required: true }) discountType: DiscountType;
  @prop({ required: true, min: 0 }) discountValue: number;
  @prop({ default: 0, min: 0 }) maxDiscount: number;
  @prop({ enum: PromotionScope, required: true }) scope: PromotionScope;
  @prop({ ref: () => Categories, type: () => [Types.ObjectId], default: [] }) categoryIds: Ref<Categories>[];
  @prop() productType?: string;
  @prop({ ref: () => Products, type: () => [Types.ObjectId], default: [] }) productIds: Ref<Products>[];
  @prop() voucherPrefix?: string;
  @prop({ default: 0, min: 0 }) quantity: number;
  @prop({ default: 0, min: 0 }) activated: number;
  @prop({ default: 0, min: 0 }) used: number;
  @prop({ default: 1, min: 0 }) usageLimitPerCustomer: number;
  @prop({ default: 0, min: 0 }) minOrderValue: number;
  @prop({ required: true }) startAt: Date;
  @prop({ required: true }) endAt: Date;
  @prop({ enum: PromotionStatus, default: PromotionStatus.DRAFT }) status: PromotionStatus;
}

@index({ promotionId: 1, customerId: 1 })
export class Vouchers extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ ref: () => Promotions, required: true }) promotionId: Ref<Promotions>;
  @prop({ ref: () => Customers }) customerId?: Ref<Customers>;
  @prop({ enum: VoucherStatus, default: VoucherStatus.ACTIVE }) status: VoucherStatus;
  @prop() activatedAt?: Date;
  @prop() usedAt?: Date;
  @prop() orderReference?: string;
  @prop({ required: true }) expiresAt: Date;
}
