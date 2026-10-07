import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Categories } from '../../categories/schemas/categories.schema';
import { Products } from '../../products/schemas/products.schema';
import {
  Customers,
  CustomerSegment,
} from '../../customers/schemas/customers.schema';
import { Types } from 'mongoose';

export enum PromotionType {
  VOUCHER = 'VOUCHER',
  AUTO_DISCOUNT = 'AUTO_DISCOUNT',
  BUY_X_GET_Y = 'BUY_X_GET_Y',
  BUNDLE_GIFT = 'BUNDLE_GIFT',
}
export enum DiscountType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}
export enum PromotionScope {
  ALL = 'ALL',
  CATEGORY = 'CATEGORY',
  PRODUCT_TYPE = 'PRODUCT_TYPE',
  PRODUCTS = 'PRODUCTS',
}
export enum PromotionStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
}
export enum VoucherStatus {
  ACTIVE = 'ACTIVE',
  USED = 'USED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}
export enum PromotionConditionMetric {
  QUANTITY = 'QUANTITY',
  AMOUNT = 'AMOUNT',
  POINT = 'POINT',
}
export enum PromotionConditionOperator {
  AT_LEAST = 'AT_LEAST',
  EXACT = 'EXACT',
}
export enum PromotionProductScope {
  PRODUCTS = 'PRODUCTS',
  CATEGORY = 'CATEGORY',
  PRODUCT_TYPE = 'PRODUCT_TYPE',
  BRAND = 'BRAND',
  ALL = 'ALL',
}
export enum ConditionCombination {
  ALL = 'ALL',
  ANY = 'ANY',
}
export enum GiftSelectionMode {
  ALL = 'ALL',
  CHOOSE_ONE = 'CHOOSE_ONE',
  CHOOSE_QUANTITY = 'CHOOSE_QUANTITY',
  SAME_AS_PURCHASED = 'SAME_AS_PURCHASED',
}
export enum RewardRepeatMode {
  ONCE = 'ONCE',
  MULTIPLE = 'MULTIPLE',
}
export enum VoucherAudience {
  SHARED = 'SHARED',
  CUSTOMER = 'CUSTOMER',
}
export enum VoucherConversionType {
  NONE = 'NONE',
  INVOICE_COIN = 'INVOICE_COIN',
  PLUSEX = 'PLUSEX',
}

export class PromotionCondition {
  @prop({ enum: PromotionConditionMetric, required: true })
  metric: PromotionConditionMetric;
  @prop({
    enum: PromotionConditionOperator,
    default: PromotionConditionOperator.AT_LEAST,
  })
  operator: PromotionConditionOperator;
  @prop({ enum: PromotionProductScope, required: true })
  scope: PromotionProductScope;
  @prop({ ref: () => Products, type: () => [Types.ObjectId], default: [] })
  productIds: Ref<Products>[];
  @prop({ ref: () => Categories, type: () => [Types.ObjectId], default: [] })
  categoryIds: Ref<Categories>[];
  @prop() productType?: string;
  @prop({ type: () => [String], default: [] }) brandIds: string[];
  @prop({ min: 0 }) minimumQuantity?: number;
  @prop({ min: 0 }) minimumAmount?: number;
  @prop({ min: 0 }) minimumPoints?: number;
  @prop({ default: true }) allowMixedProducts: boolean;
  @prop({ default: true }) allowMixedBrands: boolean;
  @prop() groupKey?: string;
}

export class PromotionConditionGroup {
  @prop({ enum: ConditionCombination, default: ConditionCombination.ALL })
  combination: ConditionCombination;
  @prop({ type: () => [PromotionCondition], default: [] })
  conditions: PromotionCondition[];
}

export class PromotionGiftGroup {
  @prop({ required: true }) code: string;
  @prop() name?: string;
  @prop({ enum: GiftSelectionMode, required: true })
  selectionMode: GiftSelectionMode;
  @prop({ min: 1 }) requiredSelectionCount?: number;
  @prop({ required: true, min: 1 }) giftQuantity: number;
  @prop({ ref: () => Products, type: () => [Types.ObjectId], default: [] })
  productIds: Ref<Products>[];
  @prop({ default: false }) sameAsPurchased: boolean;
  @prop({ default: true }) allowMixedProducts: boolean;
}

export class PromotionContributionRule {
  @prop({ enum: PromotionProductScope, required: true })
  scope: PromotionProductScope;
  @prop({ ref: () => Products, type: () => [Types.ObjectId], default: [] })
  productIds: Ref<Products>[];
  @prop({ ref: () => Categories, type: () => [Types.ObjectId], default: [] })
  categoryIds: Ref<Categories>[];
  @prop({ type: () => [String], default: [] }) brandIds: string[];
  @prop({ required: true, min: 1 }) quantityPerUnit: number;
  @prop({ required: true, min: 0 }) contributionPoints: number;
  @prop({ min: 0 }) maxQuantity?: number;
}

@index({ type: 1, status: 1, startAt: 1, endAt: 1 })
@index({ activationPrefix: 1 })
export class Promotions extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ required: true }) name: string;
  @prop({ enum: PromotionType, required: true }) type: PromotionType;
  @prop({ enum: DiscountType }) discountType?: DiscountType;
  @prop({ min: 0 }) discountValue?: number;
  @prop({ default: 0, min: 0 }) maxDiscount: number;
  @prop({ enum: PromotionScope }) scope?: PromotionScope;
  @prop({ ref: () => Categories, type: () => [Types.ObjectId], default: [] })
  categoryIds: Ref<Categories>[];
  @prop() productType?: string;
  @prop({ ref: () => Products, type: () => [Types.ObjectId], default: [] })
  productIds: Ref<Products>[];
  @prop() voucherPrefix?: string;
  @prop() activationPrefix?: string;
  @prop({ default: 0, min: 0 }) quantity: number;
  @prop({ default: 0, min: 0 }) activated: number;
  @prop({ default: 0, min: 0 }) used: number;
  @prop({ default: 1, min: 0 }) usageLimitPerCustomer: number;
  @prop({ default: 0, min: 0 }) minOrderValue: number;
  @prop({ default: false }) advancedVoucher: boolean;
  @prop({ enum: VoucherAudience, default: VoucherAudience.CUSTOMER })
  voucherAudience: VoucherAudience;
  @prop() sharedCode?: string;
  @prop({ default: 1, min: 0 }) maxUsesPerVoucher: number;
  @prop({ default: 0, min: 0 }) totalUsageLimit: number;
  @prop({ default: 0, min: 0 }) budgetLimit: number;
  @prop({ default: 0, min: 0 }) budgetUsed: number;
  @prop({ default: false }) allowStacking: boolean;
  @prop({ ref: () => Categories, type: () => [Types.ObjectId], default: [] })
  excludedCategoryIds: Ref<Categories>[];
  @prop({ ref: () => Products, type: () => [Types.ObjectId], default: [] })
  excludedProductIds: Ref<Products>[];
  @prop({ enum: CustomerSegment, type: () => [String], default: [] })
  eligibleCustomerSegments: CustomerSegment[];
  @prop({ default: 0, min: 0 }) inactiveMonths: number;
  @prop({ enum: VoucherConversionType, default: VoucherConversionType.NONE })
  conversionType: VoucherConversionType;
  @prop({ default: 0, min: 0 }) conversionCost: number;
  @prop({ default: 0, min: 0 }) dynamicExpiryDays: number;
  @prop({ type: () => [Number], default: [] }) allowedWeekdays: number[];
  @prop() dailyStartTime?: string;
  @prop() dailyEndTime?: string;
  @prop({ type: () => [PromotionConditionGroup], default: [] })
  conditionGroups: PromotionConditionGroup[];
  @prop({ type: () => [PromotionGiftGroup], default: [] })
  giftGroups: PromotionGiftGroup[];
  @prop({ type: () => [PromotionContributionRule], default: [] })
  contributionRules: PromotionContributionRule[];
  @prop({ enum: RewardRepeatMode, default: RewardRepeatMode.MULTIPLE })
  repeatMode: RewardRepeatMode;
  @prop({ min: 1 }) maxApplicationsPerInvoice?: number;
  @prop({ required: true }) startAt: Date;
  @prop({ required: true }) endAt: Date;
  @prop({ enum: PromotionStatus, default: PromotionStatus.DRAFT })
  status: PromotionStatus;
}

@index({ promotionId: 1, customerId: 1 })
export class Vouchers extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ ref: () => Promotions, required: true }) promotionId: Ref<Promotions>;
  @prop({ ref: () => Customers }) customerId?: Ref<Customers>;
  @prop({ enum: VoucherStatus, default: VoucherStatus.ACTIVE })
  status: VoucherStatus;
  @prop() activatedAt?: Date;
  @prop() usedAt?: Date;
  @prop() orderReference?: string;
  @prop() invoiceId?: string;
  @prop({ default: 0, min: 0 }) usageCount: number;
  @prop({ default: 1, min: 0 }) maxUses: number;
  @prop({ required: true }) expiresAt: Date;
}
