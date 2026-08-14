import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

export enum WebsiteContentType {
  ARTICLE = 'ARTICLE',
  TECHNICAL = 'TECHNICAL',
  NEWS = 'NEWS',
  PAGE = 'PAGE',
}

export enum WebsiteContentStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

@index({ slug: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } })
@index({ status: 1, publishedAt: -1 })
export class WebsiteContents extends BaseModel {
  @prop({ required: true, trim: true }) title: string;
  @prop({ required: true, trim: true }) slug: string;
  @prop({ required: true, enum: WebsiteContentType }) type: WebsiteContentType;
  @prop() categoryId?: string;
  @prop() excerpt?: string;
  @prop({ required: true }) contentHtml: string;
  @prop() coverImageUrl?: string;
  @prop({ type: () => [String], default: [] }) hashtags: string[];
  @prop({ enum: WebsiteContentStatus, default: WebsiteContentStatus.DRAFT }) status: WebsiteContentStatus;
  @prop({ default: false }) requiresCustomerVerification: boolean;
  @prop() publishedAt?: Date;
  @prop({ required: true }) createdBy: string;
  @prop() updatedBy?: string;
}
