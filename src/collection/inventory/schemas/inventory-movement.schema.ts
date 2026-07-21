import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Products } from '../../products/schemas/products.schema';
import { Trucks } from '../../trucks/schemas/trucks.schema';

export enum InventoryMovementType {
  IMPORT = 'IMPORT',
  WAREHOUSE_SALE = 'WAREHOUSE_SALE',
  TRANSFER_TO_TRUCK = 'TRANSFER_TO_TRUCK',
  RETURN_FROM_TRUCK = 'RETURN_FROM_TRUCK',
  TRUCK_SALE = 'TRUCK_SALE',
  ADJUSTMENT_IN = 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT',
}

export enum InventoryLocationType {
  WAREHOUSE = 'WAREHOUSE',
  TRUCK = 'TRUCK',
}

@index({ productId: 1, createdAt: -1 })
export class InventoryMovements extends BaseModel {
  @prop({ ref: () => Products, required: true, index: true })
  productId: Ref<Products>;

  @prop({ required: true, enum: InventoryMovementType })
  type: InventoryMovementType;

  @prop({ required: true })
  quantityChange: number;

  @prop({ required: true })
  quantityBefore: number;

  @prop({ required: true })
  quantityAfter: number;

  @prop({ enum: InventoryLocationType })
  sourceType?: InventoryLocationType;

  @prop({ ref: () => Trucks })
  sourceTruckId?: Ref<Trucks>;

  @prop({ enum: InventoryLocationType })
  destinationType?: InventoryLocationType;

  @prop({ ref: () => Trucks })
  destinationTruckId?: Ref<Trucks>;

  @prop()
  referenceType?: string;

  @prop()
  referenceId?: string;

  @prop()
  referenceCode?: string;

  @prop()
  createdBy?: string;
}
