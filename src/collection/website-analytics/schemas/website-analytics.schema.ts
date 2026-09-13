import { index, modelOptions, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

export enum WebsiteEventType {
  PAGE_VIEW = 'page_view',
  QR_VISIT = 'qr_visit',
  VIDEO_PLAY = 'video_play',
  PRODUCT_DETAIL_VIEW = 'product_detail_view',
  OFFER_VIEW = 'offer_view',
  ZALO_CLICK = 'zalo_click',
  CALL_CLICK = 'call_click',
  FORM_SUBMIT = 'form_submit',
}

@index({ landingKey: 1, createdAt: -1 })
@index({ eventType: 1, createdAt: -1 })
@index({ sessionId: 1, createdAt: -1 })
@modelOptions({ schemaOptions: { collection: 'website_analytics_events' } })
export class WebsiteAnalyticsEvents extends BaseModel {
  @prop({ required: true, enum: WebsiteEventType }) eventType: WebsiteEventType;
  @prop({ required: true, trim: true }) landingKey: string;
  @prop({ required: true, trim: true }) pagePath: string;
  @prop({ required: true, trim: true }) sessionId: string;
  @prop({ trim: true }) visitorId?: string;
  @prop({ trim: true }) source?: string;
  @prop({ trim: true }) medium?: string;
  @prop({ trim: true }) campaign?: string;
  @prop({ trim: true }) content?: string;
  @prop({ trim: true }) term?: string;
  @prop({ trim: true }) sale?: string;
  @prop({ trim: true }) product?: string;
  @prop({ trim: true }) model?: string;
  @prop({ trim: true }) referrer?: string;
  @prop({ trim: true }) deviceType?: string;
  @prop({ trim: true }) userAgent?: string;
  @prop({ type: () => Object, default: {} }) metadata?: Record<string, any>;
}

export enum WebsiteLandingLeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  CONVERTED = 'CONVERTED',
  CLOSED = 'CLOSED',
}

@index({ landingKey: 1, createdAt: -1 })
@index({ phone: 1, createdAt: -1 })
@modelOptions({ schemaOptions: { collection: 'website_landing_leads' } })
export class WebsiteLandingLeads extends BaseModel {
  @prop({ required: true, trim: true }) name: string;
  @prop({ required: true, trim: true }) phone: string;
  @prop({ trim: true }) province?: string;
  @prop({ trim: true }) role?: string;
  @prop({ required: true, trim: true }) landingKey: string;
  @prop({ required: true, trim: true }) sessionId: string;
  @prop({ trim: true }) source?: string;
  @prop({ trim: true }) medium?: string;
  @prop({ trim: true }) campaign?: string;
  @prop({ trim: true }) content?: string;
  @prop({ trim: true }) sale?: string;
  @prop({ required: true, enum: WebsiteLandingLeadStatus, default: WebsiteLandingLeadStatus.NEW })
  status: WebsiteLandingLeadStatus;
}
