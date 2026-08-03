import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Users } from '../../users/schemas/users.schema';

export enum NotificationType {
  INVOICE_CREATED = 'INVOICE_CREATED',
  INVOICE_REVERSED = 'INVOICE_REVERSED',
  TRUCK_LOADED = 'TRUCK_LOADED',
  TRUCK_RETURNED = 'TRUCK_RETURNED',
  TRUCK_TO_TRUCK = 'TRUCK_TO_TRUCK',
  TRANSFER_REVERSED = 'TRANSFER_REVERSED',
  CUSTOMER_RETURN_CREATED = 'CUSTOMER_RETURN_CREATED',
  CUSTOMER_RETURN_REVERSED = 'CUSTOMER_RETURN_REVERSED',
}

@index({ recipientId: 1, readAt: 1, createdAt: -1 })
@index({ audience: 1, createdAt: -1 })
export class Notifications extends BaseModel {
  @prop({ enum: NotificationType, required: true }) type: NotificationType;
  @prop({ required: true }) title: string;
  @prop({ required: true }) message: string;
  @prop({ enum: ['ADMIN', 'STAFF'], required: true }) audience: 'ADMIN' | 'STAFF';
  @prop({ ref: () => Users }) recipientId?: Ref<Users>;
  @prop() entityType?: string;
  @prop() entityId?: string;
  @prop() entityCode?: string;
  @prop() data?: Record<string, unknown>;
  @prop() readAt?: Date;
}
