import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

export enum WebsiteOrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  ASSIGNED = 'ASSIGNED',
  PROCESSING = 'PROCESSING',
  SHIPPING = 'SHIPPING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum WebsitePaymentMethod {
  COD = 'COD',
  VNPAY_SIMULATED = 'VNPAY_SIMULATED',
}

export enum WebsitePaymentStatus {
  UNPAID = 'UNPAID',
  PAID_SIMULATED = 'PAID_SIMULATED',
}

export enum WebsiteCustomerType {
  EXISTING = 'EXISTING',
  NEW = 'NEW',
}

export enum WebsiteOrderConversionStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export class WebsiteOrderItem {
  @prop({ required: true }) websiteProductId: string;
  @prop() inventoryProductId?: string;
  @prop({ required: true }) productCode: string;
  @prop({ required: true }) productName: string;
  @prop() unit?: string;
  @prop({ required: true, min: 1 }) quantity: number;
  @prop({ required: true, min: 0 }) unitPrice: number;
  @prop({ required: true, min: 0 }) lineTotal: number;
}

export class WebsiteOrderStatusHistory {
  @prop({ required: true, enum: WebsiteOrderStatus }) status: WebsiteOrderStatus;
  @prop({ required: true }) at: Date;
  @prop() by?: string;
  @prop() note?: string;
}

@index({ code: 1 }, { unique: true })
@index({ status: 1, createdAt: -1 })
@index({ customerPhone: 1, createdAt: -1 })
export class WebsiteOrders extends BaseModel {
  @prop({ required: true }) code: string;
  @prop({ required: true, enum: WebsiteCustomerType }) customerType: WebsiteCustomerType;
  @prop() customerId?: string;
  @prop({ required: true }) customerName: string;
  @prop({ required: true }) customerPhone: string;
  @prop() customerEmail?: string;
  @prop({ required: true }) deliveryAddress: string;
  @prop() customerNote?: string;
  @prop({ type: () => [WebsiteOrderItem], default: [] }) items: WebsiteOrderItem[];
  @prop({ required: true, min: 0 }) subtotal: number;
  @prop({ default: 0, min: 0 }) discountAmount: number;
  @prop({ default: 0, min: 0 }) shippingFee: number;
  @prop({ required: true, min: 0 }) totalAmount: number;
  @prop({ required: true, enum: WebsitePaymentMethod }) paymentMethod: WebsitePaymentMethod;
  @prop({ required: true, enum: WebsitePaymentStatus, default: WebsitePaymentStatus.UNPAID })
  paymentStatus: WebsitePaymentStatus;
  @prop({ required: true, enum: WebsiteOrderStatus, default: WebsiteOrderStatus.PENDING })
  status: WebsiteOrderStatus;
  @prop() assignedSaleId?: string;
  @prop() assignedAt?: Date;
  @prop() assignedBy?: string;
  @prop() invoiceId?: string;
  @prop() invoiceCode?: string;
  @prop({ enum: WebsiteOrderConversionStatus }) conversionStatus?: WebsiteOrderConversionStatus;
  @prop() conversionIdempotencyKeyHash?: string;
  @prop() conversionStartedAt?: Date;
  @prop() convertedAt?: Date;
  @prop() convertedBy?: string;
  @prop() conversionError?: string;
  @prop({ required: true, select: false }) accessTokenHash: string;
  @prop({ type: () => [WebsiteOrderStatusHistory], default: [] })
  statusHistory: WebsiteOrderStatusHistory[];
}

export class WebsiteOrderCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ required: true, default: 0 }) sequence: number;
}
