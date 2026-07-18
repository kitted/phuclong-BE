import { BaseModel } from '../../../core/base.model';
import { prop, Ref } from '@typegoose/typegoose';
import { Products } from 'src/collection/products/schemas/products.schema';
import { Trucks } from 'src/collection/trucks/schemas/trucks.schema';

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
