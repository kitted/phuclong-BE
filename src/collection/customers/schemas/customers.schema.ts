import { prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

export enum CustomerSource { LEAD = 'LEAD', LEGACY = 'LEGACY', NEW = 'NEW' }
export enum CustomerSegment { VIP = 'VIP', LOYAL = 'THÂN THIẾT', PROSPECT = 'TIỀM NĂNG', AGENT = 'ĐẠI LÝ', REGULAR = 'THƯỜNG' }

export class CustomerInteraction {
  @prop({ required: true, default: () => new Date() }) at: Date;
  @prop({ required: true }) channel: string;
  @prop({ required: true }) action: string;
  @prop() result?: string;
  @prop() createdBy?: string;
}

export class Customers extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ required: true }) name: string;
  @prop({ required: true, unique: true }) phone: string;
  @prop() email?: string;
  @prop() address?: string;
  @prop({ default: false }) zaloConnected: boolean;
  @prop({ enum: CustomerSource, default: CustomerSource.LEAD }) source: CustomerSource;
  @prop({ enum: CustomerSegment, default: CustomerSegment.REGULAR }) segment: CustomerSegment;
  @prop({ default: 0, min: 0 }) debt: number;
  @prop({ default: 0, min: 0 }) debtLimit: number;
  @prop() note?: string;
  @prop({ type: () => [CustomerInteraction], default: [] }) interactions: CustomerInteraction[];
}
