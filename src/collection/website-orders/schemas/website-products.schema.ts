import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

@index({ legacyId: 1 })
@index({ slug: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } })
export class WebsiteProductCategories extends BaseModel {
  @prop() legacyId?: string;
  @prop({ required: true }) name: string;
  @prop({ required: true }) slug: string;
  @prop() description?: string;
  @prop() imageUrl?: string;
  @prop({ default: true }) isActive: boolean;
  @prop({ default: 0 }) sortOrder: number;
}

@index({ legacyId: 1 })
@index({ code: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } })
@index({ slug: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } })
export class WebsiteProducts extends BaseModel {
  @prop() legacyId?: string;
  @prop({ required: true }) code: string;
  @prop({ required: true }) name: string;
  @prop({ required: true }) slug: string;
  @prop() categoryId?: string;
  @prop() unit?: string;
  @prop({ default: 0, min: 0 }) sellPrice: number;
  @prop() shortDescription?: string;
  @prop() descriptionHtml?: string;
  @prop({ type: () => [String], default: [] }) imageUrls: string[];
  @prop({ default: true }) isActive: boolean;
  @prop() inventoryProductId?: string;
}
