import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Products } from '../../products/schemas/products.schema';
import { Trucks } from '../../trucks/schemas/trucks.schema';
import { Customers } from '../../customers/schemas/customers.schema';
import { Promotions, Vouchers } from '../../promotions/schemas/promotions.schema';
import { Users } from '../../users/schemas/users.schema';

export enum PaymentMethod { CASH = 'CASH', BANK_TRANSFER = 'BANK_TRANSFER' }
export enum InvoicePaymentStatus { UNPAID = 'UNPAID', PARTIAL = 'PARTIAL', PAID = 'PAID' }
export enum InvoiceLineType { SALE = 'SALE', GIFT = 'GIFT' }

export class InvoicePayment {
  @prop({ required: true, enum: PaymentMethod }) method: PaymentMethod;
  @prop({ required: true, min: 0 }) amount: number;
  @prop() referenceCode?: string;
  @prop() bankName?: string;
  @prop() note?: string;
}
export class InvoiceDebtPayment {
  @prop({ required: true }) receiptId: string;
  @prop({ required: true }) receiptCode: string;
  @prop({ required: true, min: 0 }) amount: number;
  @prop({ required: true }) paidAt: Date;
}

export class InvoiceItem {
  @prop({ ref: () => Products, required: true }) productId: Ref<Products>;
  @prop({ required: true }) productCode: string;
  @prop({ required: true }) productName: string;
  @prop() unit?: string;
  @prop() categoryId?: string;
  @prop() categoryCode?: string;
  @prop() categoryName?: string;
  @prop() brandId?: string;
  @prop() brandCode?: string;
  @prop() brandName?: string;
  @prop() productType?: string;
  @prop({ required: true, min: 1 }) qty: number;
  @prop({ required: true, min: 0 }) price: number;
  @prop({ required: true, min: 0 }) lineTotal: number;
  @prop({ enum: InvoiceLineType, default: InvoiceLineType.SALE }) lineType: InvoiceLineType;
  @prop({ min: 0 }) originalPrice?: number;
}

export class InvoicePromotionGift {
  @prop({ required: true }) groupCode: string;
  @prop({ ref: () => Products, required: true }) productId: Ref<Products>;
  @prop({ required: true }) productCode: string;
  @prop({ required: true }) productName: string;
  @prop() unit?: string;
  @prop({ required: true, min: 1 }) qty: number;
  @prop({ default: 0 }) costPrice: number;
  @prop({ default: 0 }) sellPrice: number;
}
export class InvoiceMatchedCondition {
  @prop({ required: true }) metric: string;
  @prop({ required: true }) value: number;
  @prop({ required: true }) threshold: number;
  @prop({ required: true }) eligible: boolean;
  @prop({ required: true }) applicationCount: number;
  @prop({ required: true }) missing: number;
}
export class InvoiceMatchedConditionGroup {
  @prop({ required: true }) combination: string;
  @prop({ required: true }) eligible: boolean;
  @prop({ required: true }) applicationCount: number;
  @prop({ type: () => [InvoiceMatchedCondition], default: [] }) conditions: InvoiceMatchedCondition[];
}
export class InvoicePromotionApplication {
  @prop({ ref: () => Promotions, required: true }) promotionId: Ref<Promotions>;
  @prop({ required: true }) promotionCode: string;
  @prop({ required: true }) promotionName: string;
  @prop({ required: true, min: 1 }) applicationCount: number;
  @prop({ type: () => [InvoiceMatchedConditionGroup], default: [] }) matchedConditions: InvoiceMatchedConditionGroup[];
  @prop({ type: () => [InvoicePromotionGift], default: [] }) gifts: InvoicePromotionGift[];
  @prop() activationId?: string;
  @prop() activationCode?: string;
}

@index({ salespersonId: 1, date: -1 })
@index({ salespersonId: 1, paymentStatus: 1, date: -1 })
@index({ promotionId: 1, date: -1 })
export class Invoices extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ required: true }) date: Date;
  @prop({ default: 'Khách lẻ' }) customer: string;
  @prop({ ref: () => Customers, default: null, index: true }) customerId?: Ref<Customers>;
  @prop({ required: true, enum: ['warehouse', 'truck'] }) sourceType: string;
  @prop({ ref: () => Trucks }) truckId?: Ref<Trucks>;
  @prop() note?: string;
  @prop({ required: true, min: 0 }) subtotal: number;
  @prop({ default: 0, min: 0 }) discountAmount: number;
  @prop({ required: true, min: 0 }) grandTotal: number;
  @prop({ required: true, min: 0 }) totalAmount: number;
  @prop({ type: () => [InvoicePayment], default: [] }) payments: InvoicePayment[];
  @prop({ default: 0, min: 0 }) paidAmount: number;
  @prop({ default: 0, min: 0 }) debtAmount: number;
  @prop({ type: () => [InvoiceDebtPayment], default: [] }) debtPayments: InvoiceDebtPayment[];
  @prop({ default: false }) debtLimitOverridden: boolean;
  @prop() debtOverrideReason?: string;
  @prop({ enum: InvoicePaymentStatus, default: InvoicePaymentStatus.UNPAID }) paymentStatus: InvoicePaymentStatus;
  @prop({ ref: () => Promotions }) promotionId?: Ref<Promotions>;
  @prop() promotionCode?: string;
  @prop() promotionName?: string;
  @prop({ ref: () => Vouchers }) voucherId?: Ref<Vouchers>;
  @prop() voucherCode?: string;
  @prop() discountType?: string;
  @prop() discountValue?: number;
  @prop({ type: () => [InvoicePromotionApplication], default: [] }) promotionApplications: InvoicePromotionApplication[];
  @prop({ ref: () => Users, required: true, index: true }) salespersonId: Ref<Users>;
  @prop({ required: true }) salespersonCode: string;
  @prop({ required: true }) salespersonName: string;
  @prop({ ref: () => Users }) createdBy?: Ref<Users>;
  @prop({ type: () => [InvoiceItem], default: [] }) items: InvoiceItem[];
}
