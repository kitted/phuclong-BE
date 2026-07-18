import { prop } from '@typegoose/typegoose';
import { Schema } from 'mongoose';
import { BaseModel } from '../../../core/base.model';

export class ResetToken extends BaseModel {
  @prop({ required: true })
  userId: Schema.Types.ObjectId;

  @prop({ required: true })
  token: string;
}
