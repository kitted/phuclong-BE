import { BaseModel } from '../../../core/base.model';
import { prop, Ref } from '@typegoose/typegoose';
import { Products } from 'src/collection/products/schemas/products.schema';
import { Trucks } from 'src/collection/trucks/schemas/trucks.schema';
import { Customers } from 'src/collection/customers/schemas/customers.schema';

export class InvoiceItem {
  @prop({ ref: () => Products, required: true })
  productId: Ref<Products>;

  @prop({ required: true, default: 0 })
  qty: number;

  @prop({ required: true, default: 0 })
  price: number;
}

export class Invoices extends BaseModel {
  @prop({ required: true, unique: true })
  code: string;

  @prop({ required: true })
  date: string;

  @prop({ required: true })
  customer: string;

  @prop({ ref: () => Customers, required: false, default: null, index: true })
  customerId?: Ref<Customers>;

  @prop({ default: 0, min: 0 })
  paidAmount: number;

  @prop({ default: 'UNPAID', enum: ['UNPAID', 'PARTIAL', 'PAID'] })
  paymentStatus: string;

  @prop({ required: true, enum: ['warehouse', 'truck'] })
  sourceType: string;

  @prop({ ref: () => Trucks })
  truckId?: Ref<Trucks>;

  @prop()
  note?: string;

  @prop({ default: 0 })
  totalAmount: number;

  @prop({ type: () => [InvoiceItem], default: [] })
  items: InvoiceItem[];
}
