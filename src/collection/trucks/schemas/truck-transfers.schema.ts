import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Products } from '../../products/schemas/products.schema';
import { Trucks } from './trucks.schema';
import { Users } from '../../users/schemas/users.schema';

export enum TruckTransferType { LOAD = 'LOAD', RETURN = 'RETURN' }

export class TruckTransferItem {
  @prop({ ref: () => Products, required: true }) productId: Ref<Products>;
  @prop({ required: true }) productCode: string;
  @prop({ required: true }) productName: string;
  @prop() unit?: string;
  @prop({ required: true, min: 1 }) qty: number;
  @prop({ required: true, min: 0 }) unitCost: number;
}

@index({ truckId: 1, date: -1 })
@index({ type: 1, date: -1 })
export class TruckTransfers extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ required: true, enum: TruckTransferType }) type: TruckTransferType;
  @prop({ ref: () => Trucks, required: true }) truckId: Ref<Trucks>;
  @prop({ required: true }) truckCode: string;
  @prop({ required: true }) truckName: string;
  @prop({ required: true, default: () => new Date() }) date: Date;
  @prop() note?: string;
  @prop({ type: () => [TruckTransferItem], default: [] }) items: TruckTransferItem[];
  @prop({ required: true, min: 0 }) totalQuantity: number;
  @prop({ required: true, min: 0 }) totalValue: number;
  @prop({ ref: () => Users }) createdBy?: Ref<Users>;
}
