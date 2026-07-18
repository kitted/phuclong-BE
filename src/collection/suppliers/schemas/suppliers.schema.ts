import { BaseModel } from '../../../core/base.model';
import { prop } from '@typegoose/typegoose';

export class Suppliers extends BaseModel {
  @prop({ required: true })
  name: string;

  @prop()
  phone?: string;

  @prop()
  email?: string;

  @prop()
  address?: string;
}
