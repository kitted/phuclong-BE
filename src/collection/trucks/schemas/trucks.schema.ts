import { BaseModel } from '../../../core/base.model';
import { prop, Ref } from '@typegoose/typegoose';
import { Products } from 'src/collection/products/schemas/products.schema';

export class TruckInventory {
  @prop({ ref: () => Products, required: true })
  productId: Ref<Products>;

  @prop({ required: true, default: 0 })
  qty: number;
}

export class Trucks extends BaseModel {
  @prop({ unique: true, required: true })
  code: string;

  @prop({ required: true })
  name: string;

  @prop({ required: true, unique: true })
  licensePlate: string;

  @prop()
  driver?: string;

  @prop()
  phone?: string;

  @prop({ default: 'active', enum: ['active', 'inactive'] })
  status: string;

  @prop({ type: () => [TruckInventory], default: [] })
  inventory: TruckInventory[];
}
