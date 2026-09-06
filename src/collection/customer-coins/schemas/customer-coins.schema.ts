import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Customers } from '../../customers/schemas/customers.schema';
import { Invoices } from '../../invoices/schemas/invoices.schema';
import { Users } from '../../users/schemas/users.schema';

export enum CustomerCoinType {
  INVOICE = 'INVOICE',
  PLUSEX = 'PLUSEX',
}

export enum CustomerCoinTransactionType {
  EARN = 'EARN',
  REVERSAL = 'REVERSAL',
  REDEEM = 'REDEEM',
  ADJUSTMENT = 'ADJUSTMENT',
}

export class CustomerCoinProductBreakdown {
  @prop({ required: true }) productId: string;
  @prop({ required: true }) productCode: string;
  @prop({ required: true }) productName: string;
  @prop({ required: true, min: 0 }) quantity: number;
  @prop({ required: true, min: 0 }) amount: number;
}

@index({ eventKey: 1 }, { unique: true })
@index({ customerId: 1, occurredAt: -1 })
@index({ coinType: 1, occurredAt: -1 })
export class CustomerCoinLedgers extends BaseModel {
  @prop({ required: true }) eventKey: string;
  @prop({ required: true, ref: () => Customers }) customerId: Ref<Customers>;
  @prop() customerCode?: string;
  @prop({ required: true }) customerName: string;
  @prop({ required: true, enum: CustomerCoinType }) coinType: CustomerCoinType;
  @prop({ required: true, enum: CustomerCoinTransactionType })
  transactionType: CustomerCoinTransactionType;
  @prop({ required: true }) change: number;
  @prop({ required: true }) balanceAfter: number;
  @prop({ ref: () => Invoices }) invoiceId?: Ref<Invoices>;
  @prop() invoiceCode?: string;
  @prop() redemptionCode?: string;
  @prop() idempotencyKey?: string;
  @prop() reason?: string;
  @prop({ type: () => [CustomerCoinProductBreakdown], default: [] })
  products: CustomerCoinProductBreakdown[];
  @prop({ required: true }) occurredAt: Date;
  @prop({ ref: () => Users }) createdBy?: Ref<Users>;
  @prop() createdByName?: string;
}

export class CustomerCoinCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ required: true, default: 0 }) sequence: number;
}
