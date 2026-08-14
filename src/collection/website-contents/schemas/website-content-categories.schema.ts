import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

@index(
  { slug: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, slug: { $type: 'string' } },
  },
)
@index({ isActive: 1, sortOrder: 1 })
export class WebsiteContentCategories extends BaseModel {
  @prop({ required: true, trim: true }) name: string;
  @prop({ required: true, trim: true }) slug: string;
  @prop() description?: string;
  @prop() imageUrl?: string;
  @prop({ default: true }) isActive: boolean;
  @prop({ default: 0 }) sortOrder: number;
  @prop({ required: true }) createdBy: string;
  @prop() updatedBy?: string;
}
