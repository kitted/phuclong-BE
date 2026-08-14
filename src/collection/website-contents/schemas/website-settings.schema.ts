import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

export enum WebsiteSettingType {
  TEXT = 'TEXT',
  RICH_TEXT = 'RICH_TEXT',
  IMAGE = 'IMAGE',
  JSON = 'JSON',
}

@index(
  { key: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  },
)
@index({ group: 1, sortOrder: 1 })
export class WebsiteSettings extends BaseModel {
  @prop({ required: true, trim: true }) key: string;
  @prop({ required: true, trim: true }) label: string;
  @prop({ required: true, trim: true }) group: string;
  @prop({ required: true, enum: WebsiteSettingType }) type: WebsiteSettingType;
  @prop({ required: true }) value: string;
  @prop({ default: true }) isPublic: boolean;
  @prop({ default: true }) isActive: boolean;
  @prop({ default: 0 }) sortOrder: number;
  @prop({ required: true }) createdBy: string;
  @prop() updatedBy?: string;
}
