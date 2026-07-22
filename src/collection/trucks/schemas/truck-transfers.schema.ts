import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Products } from '../../products/schemas/products.schema';
import { Trucks } from './trucks.schema';
import { Users } from '../../users/schemas/users.schema';

export enum TruckTransferType { LOAD = 'LOAD', RETURN = 'RETURN', TRUCK_TO_TRUCK = 'TRUCK_TO_TRUCK' }

export class TruckTransferItem {
  @prop({ ref: () => Products, required: true }) productId: Ref<Products>;
  @prop({ required: true }) productCode: string;
  @prop({ required: true }) productName: string;
  @prop() unit?: string;
  @prop({ required: true, min: 1 }) qty: number;
  @prop({ required: true, min: 0 }) unitCost: number;
  @prop({ required: true, min: 0, default: 0 }) totalValue: number;
}

@index({ truckId: 1, date: -1 })
@index({ type: 1, date: -1 })
@index({ sourceTruckId: 1, date: -1 })
@index({ destinationTruckId: 1, date: -1 })
export class TruckTransfers extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ required: true, enum: TruckTransferType }) type: TruckTransferType;
  @prop({ ref: () => Trucks, required: true }) truckId: Ref<Trucks>;
  @prop({ required: true }) truckCode: string;
  @prop({ required: true }) truckName: string;
  @prop() truckLicensePlate?: string;
  @prop({ ref: () => Users }) driverId?: Ref<Users>;
  @prop() driverCode?: string;
  @prop() driverName?: string;
  @prop() driverPhone?: string;
  @prop({ ref: () => Trucks }) sourceTruckId?: Ref<Trucks>;
  @prop() sourceTruckCode?: string;
  @prop() sourceTruckName?: string;
  @prop() sourceTruckLicensePlate?: string;
  @prop({ ref: () => Users }) sourceDriverId?: Ref<Users>;
  @prop() sourceDriverCode?: string;
  @prop() sourceDriverName?: string;
  @prop() sourceDriverPhone?: string;
  @prop({ ref: () => Trucks }) destinationTruckId?: Ref<Trucks>;
  @prop() destinationTruckCode?: string;
  @prop() destinationTruckName?: string;
  @prop() destinationTruckLicensePlate?: string;
  @prop({ ref: () => Users }) destinationDriverId?: Ref<Users>;
  @prop() destinationDriverCode?: string;
  @prop() destinationDriverName?: string;
  @prop() destinationDriverPhone?: string;
  @prop({ required: true, default: () => new Date() }) date: Date;
  @prop() note?: string;
  @prop({ type: () => [TruckTransferItem], default: [] }) items: TruckTransferItem[];
  @prop({ required: true, min: 0 }) totalQuantity: number;
  @prop({ required: true, min: 0 }) totalValue: number;
  @prop({ ref: () => Users }) createdBy?: Ref<Users>;
  @prop({ ref: () => TruckTransfers }) reversalOf?: Ref<TruckTransfers>;
}

export class TruckTransferCounters { @prop({ required: true, unique: true }) key: string; @prop({ default: 0 }) sequence: number; }
