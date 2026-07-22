import { BaseModel } from '../../../core/base.model';
import { index, prop, Ref } from '@typegoose/typegoose';
import { Products } from 'src/collection/products/schemas/products.schema';
import { Users } from '../../users/schemas/users.schema';

export class TruckInventory {
  @prop({ ref: () => Products, required: true })
  productId: Ref<Products>;

  @prop({ required: true, default: 0 })
  qty: number;
}

@index(
  { driverId: 1 },
  { unique: true, partialFilterExpression: { driverId: { $type: 'objectId' }, isDeleted: false } },
)
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

  @prop({ ref: () => Users, default: null })
  driverId?: Ref<Users>;

  @prop({ trim: true })
  driverName?: string;

  @prop({ trim: true })
  driverPhone?: string;

  @prop({ default: 'active', enum: ['active', 'inactive'] })
  status: string;

  @prop({ type: () => [TruckInventory], default: [] })
  inventory: TruckInventory[];
}
