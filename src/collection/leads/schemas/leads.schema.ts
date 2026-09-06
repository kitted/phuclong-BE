import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Users } from '../../users/schemas/users.schema';
import { Customers } from '../../customers/schemas/customers.schema';

export enum LeadInteractionResult {
  VISITED = 'VISITED',
  SOLD = 'SOLD',
  NO_SALE = 'NO_SALE',
}

export class LeadLocation {
  @prop({ required: true }) latitude: number;
  @prop({ required: true }) longitude: number;
  @prop() address?: string;
}

export class LeadInteraction {
  @prop({ required: true, ref: () => Users }) salespersonId: Ref<Users>;
  @prop({ required: true }) salespersonName: string;
  @prop() salespersonCode?: string;
  @prop({ required: true }) note: string;
  @prop({ required: true, enum: LeadInteractionResult })
  result: LeadInteractionResult;
  @prop({ ref: () => Customers }) customerId?: Ref<Customers>;
  @prop() invoiceId?: string;
  @prop({ required: true, default: () => new Date() }) interactedAt: Date;
}

@index({ isDeleted: 1, name: 1 })
@index({ phone: 1 })
@index({ 'location.latitude': 1, 'location.longitude': 1 })
export class Leads extends BaseModel {
  @prop({ required: true, trim: true }) name: string;
  @prop({ required: true, trim: true }) phone: string;
  @prop({ trim: true }) contactName?: string;
  @prop({ trim: true }) businessType?: string;
  @prop({ trim: true }) note?: string;
  @prop({ type: () => LeadLocation, _id: false, required: true })
  location: LeadLocation;
  @prop() imageUrl?: string;
  @prop() imagePublicId?: string;
  @prop({ default: '#5e72e4' }) color: string;
  @prop({ default: false }) converted: boolean;
  @prop({ ref: () => Users }) createdBy?: Ref<Users>;
  @prop() createdByName?: string;
  @prop() createdByCode?: string;
  @prop({ ref: () => Customers }) customerId?: Ref<Customers>;
  @prop() convertedAt?: Date;
  @prop({ type: () => [LeadInteraction], default: [] })
  interactions: LeadInteraction[];
}
