import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Customers } from '../../customers/schemas/customers.schema';
import { Invoices, PaymentMethod } from '../../invoices/schemas/invoices.schema';
import { Users } from '../../users/schemas/users.schema';
export enum DebtPaymentStatus { ACTIVE = 'ACTIVE', CANCELLED = 'CANCELLED' }
export class DebtReceiptPayment { @prop({ required: true, enum: PaymentMethod }) method: PaymentMethod; @prop({ required: true, min: 0 }) amount: number; @prop() referenceCode?: string; @prop() bankName?: string; @prop() note?: string; }
export class DebtPaymentAllocation { @prop({ ref: () => Invoices, required: true }) invoiceId: Ref<Invoices>; @prop({ required: true }) invoiceCode: string; @prop({ required: true, min: 0 }) amount: number; @prop({ required: true, min: 0 }) debtBefore: number; @prop({ required: true, min: 0 }) debtAfter: number; }
@index({ customerId: 1, date: -1 })
@index({ status: 1, date: -1 })
export class DebtPayments extends BaseModel {
  @prop({ required: true, unique: true }) code: string; @prop({ required: true }) date: Date;
  @prop({ ref: () => Customers, required: true }) customerId: Ref<Customers>; @prop({ required: true }) customerCode: string; @prop({ required: true }) customerName: string; @prop({ required: true }) customerPhone: string;
  @prop({ required: true, min: 0 }) amount: number; @prop({ type: () => [DebtReceiptPayment], default: [] }) payments: DebtReceiptPayment[]; @prop({ type: () => [DebtPaymentAllocation], default: [] }) allocations: DebtPaymentAllocation[];
  @prop({ required: true, min: 0 }) customerDebtBefore: number; @prop({ required: true, min: 0 }) customerDebtAfter: number;
  @prop({ enum: DebtPaymentStatus, default: DebtPaymentStatus.ACTIVE }) status: DebtPaymentStatus; @prop() note?: string; @prop({ ref: () => Users }) createdBy?: Ref<Users>;
  @prop({ ref: () => Users }) cancelledBy?: Ref<Users>; @prop() cancelledAt?: Date; @prop() cancelReason?: string;
}
export class DebtPaymentCounters { @prop({ required: true, unique: true }) key: string; @prop({ default: 0 }) sequence: number; }
