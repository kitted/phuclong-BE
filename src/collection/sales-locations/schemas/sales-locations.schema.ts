import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Users } from '../../users/schemas/users.schema';

export enum SalesLocationSource {
  STAFF_HOME = 'STAFF_HOME',
  MANUAL = 'MANUAL',
}

@index({ salespersonId: 1, capturedAt: 1 })
@index({ capturedAt: 1, isDeleted: 1 })
@index({ coordinates: '2dsphere' })
export class SalesLocations extends BaseModel {
  @prop({ required: true, ref: () => Users, index: true })
  salespersonId: Ref<Users>;

  @prop({ required: true })
  salespersonName: string;

  @prop()
  salespersonCode?: string;

  @prop({ required: true, min: -90, max: 90 })
  latitude: number;

  @prop({ required: true, min: -180, max: 180 })
  longitude: number;

  @prop({ type: () => Object, required: true })
  coordinates: { type: 'Point'; coordinates: [number, number] };

  @prop({ min: 0 })
  accuracy?: number;

  @prop({ min: 0 })
  speed?: number;

  @prop({ min: 0, max: 360 })
  heading?: number;

  @prop({ required: true, enum: SalesLocationSource })
  source: SalesLocationSource;

  @prop({ required: true, index: true })
  capturedAt: Date;
}
