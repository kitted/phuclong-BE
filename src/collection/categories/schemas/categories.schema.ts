import { BaseModel } from '../../../core/base.model';
import { prop } from '@typegoose/typegoose';

export class Categories extends BaseModel {
  @prop({ required: true })
  name: string;
}
