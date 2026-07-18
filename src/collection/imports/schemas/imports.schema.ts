import { BaseModel } from '../../../core/base.model';
import { prop, Ref } from '@typegoose/typegoose';
import { Products } from 'src/collection/products/schemas/products.schema';
import { Suppliers } from 'src/collection/suppliers/schemas/suppliers.schema';

export class ImportItem {
  @prop({ ref: () => Products, required: true })
  productId: Ref<Products>;

  @prop({ required: true, default: 0 })
  qty: number;

  @prop({ required: true, default: 0 })
  price: number;
}

export class Imports extends BaseModel {
  @prop({ required: true, unique: true })
  code: string;

  @prop({ required: true })
  date: string;

  @prop({ ref: () => Suppliers })
  supplierId: Ref<Suppliers>;

  @prop({ default: 'completed', enum: ['completed', 'pending', 'cancelled'] })
  status: string;

  @prop()
  note?: string;

  @prop({ default: 0 })
  totalAmount: number;

  @prop({ type: () => [ImportItem], default: [] })
  items: ImportItem[];
}
