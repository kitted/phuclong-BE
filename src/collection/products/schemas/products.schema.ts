import { BaseModel } from '../../../core/base.model';
import { prop, Ref } from '@typegoose/typegoose';
import { Categories } from 'src/collection/categories/schemas/categories.schema';
import { Suppliers } from 'src/collection/suppliers/schemas/suppliers.schema';

export class Products extends BaseModel {
  @prop({ required: true, unique: true })
  code: string;

  @prop({ required: true })
  name: string;

  @prop({ ref: () => Categories, required: false, default: null })
  categoryId?: Ref<Categories>;

  @prop()
  unit: string;

  @prop({ default: 0 })
  costPrice: number;

  @prop({ default: 0 })
  sellPrice: number;

  @prop({ default: 0 })
  minStock: number;

  @prop({ default: 0 })
  stock: number;

  @prop({ ref: () => Suppliers, required: false, default: null })
  supplierId?: Ref<Suppliers>;
}
