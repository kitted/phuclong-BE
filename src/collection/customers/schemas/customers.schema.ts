import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

export enum CustomerSource { LEAD = 'LEAD', LEGACY = 'LEGACY', NEW = 'NEW' }
export enum CustomerSegment { TEMPORARILY_INACTIVE = 'TEMPORARILY_INACTIVE', ACTIVE = 'ACTIVE', HIGHLY_ACTIVE = 'HIGHLY_ACTIVE', STOPPED_BUYING = 'STOPPED_BUYING', CHURNED = 'CHURNED', NEW_CUSTOMER = 'NEW_CUSTOMER' }

export class CustomerInteraction {
  @prop({ required: true, default: () => new Date() }) at: Date;
  @prop({ required: true }) channel: string;
  @prop({ required: true }) action: string;
  @prop() result?: string;
  @prop() createdBy?: string;
}

@index({ phone: 1 })
@index({ phones: 1 })
export class Customers extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ required: true }) name: string;
  @prop() phone?: string;
  @prop({ type: () => [String], default: [] }) phones: string[];
  @prop() email?: string;
  @prop() address?: string;
  @prop({ default: false }) zaloConnected: boolean;
  @prop({ enum: CustomerSource, default: CustomerSource.LEAD }) source: CustomerSource;
  @prop({ enum: CustomerSegment, default: CustomerSegment.NEW_CUSTOMER }) segment: CustomerSegment;
  @prop({ default: 0, min: 0 }) debt: number;
  @prop({ default: 0, min: 0 }) debtLimit: number;
  @prop() note?: string;
  @prop({ type: () => [CustomerInteraction], default: [] }) interactions: CustomerInteraction[];
}

export class CustomerCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ required: true, default: 0 }) sequence: number;
}
