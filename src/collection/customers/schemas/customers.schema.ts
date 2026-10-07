import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Users } from '../../users/schemas/users.schema';

export enum CustomerSource {
  LEAD = 'LEAD',
  LEGACY = 'LEGACY',
  NEW = 'NEW',
}
export enum CustomerSegment {
  LEGACY = 'LEGACY',
  TEMPORARILY_INACTIVE = 'TEMPORARILY_INACTIVE',
  ACTIVE = 'ACTIVE',
  HIGHLY_ACTIVE = 'HIGHLY_ACTIVE',
  STOPPED_BUYING = 'STOPPED_BUYING',
  CHURNED = 'CHURNED',
  NEW_CUSTOMER = 'NEW_CUSTOMER',
}
export enum CustomerZaloStatus {
  CONNECTED = 'CONNECTED',
  NOT_CONNECTED = 'NOT_CONNECTED',
}
export enum CustomerInvoiceSendStatus {
  SENT = 'SENT',
  NOT_SENT = 'NOT_SENT',
  DO_NOT_SEND = 'DO_NOT_SEND',
}
export enum CustomerInteractionChannel {
  ZALO = 'ZALO',
  PHONE = 'PHONE',
  SMS = 'SMS',
}
export enum StoreLocationSource {
  GPS = 'GPS',
  MAP = 'MAP',
}
export enum CustomerCodeStatus {
  UNASSIGNED = 'UNASSIGNED',
  ASSIGNED = 'ASSIGNED',
}

export class CustomerCodeChange {
  @prop() oldCode?: string;
  @prop({ required: true }) newCode: string;
  @prop({ ref: () => Users, required: true }) changedBy: Ref<Users>;
  @prop({ required: true }) changedAt: Date;
  @prop({ required: true }) reason: string;
}

export class StoreGeoPoint {
  @prop({ required: true, enum: ['Point'], default: 'Point' }) type: 'Point';
  @prop({ type: () => [Number], required: true }) coordinates: number[];
}

export class CustomerStoreLocation {
  @prop({ required: true }) latitude: number;
  @prop({ required: true }) longitude: number;
  @prop({ min: 0 }) accuracy?: number;
  @prop({ required: true, enum: StoreLocationSource })
  source: StoreLocationSource;
  @prop() note?: string;
  @prop({ required: true }) capturedAt: Date;
  @prop({ ref: () => Users }) capturedBy?: Ref<Users>;
  @prop({ type: () => StoreGeoPoint, required: true, _id: false })
  geo: StoreGeoPoint;
}

export class CustomerStorefrontImage {
  @prop({ required: true }) url: string;
  @prop({ required: true }) publicId: string;
  @prop({ min: 0 }) width?: number;
  @prop({ min: 0 }) height?: number;
  @prop() format?: string;
  @prop({ min: 0 }) bytes?: number;
  @prop({ required: true }) uploadedAt: Date;
  @prop({ ref: () => Users }) uploadedBy?: Ref<Users>;
}

export class CustomerInteraction {
  @prop({ required: true, default: () => new Date() }) at: Date;
  @prop({ required: true }) channel: string;
  @prop({ required: true }) action: string;
  @prop() result?: string;
  @prop({ enum: CustomerZaloStatus }) zaloStatus?: CustomerZaloStatus;
  @prop({ enum: CustomerInvoiceSendStatus })
  invoiceStatus?: CustomerInvoiceSendStatus;
  @prop() interaction?: string;
  @prop() phone?: string;
  @prop() note?: string;
  @prop({ default: false }) difficultCustomer?: boolean;
  @prop() occurredAt?: Date;
  @prop() createdBy?: string;
  @prop() importKey?: string;
  @prop() invoiceId?: string;
  @prop() invoiceCode?: string;
  @prop() documentType?: string;
  @prop() documentId?: string;
  @prop() documentCode?: string;
}

@index({ phone: 1 })
@index({ phones: 1 })
@index({ 'storeLocation.geo': '2dsphere' })
@index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, code: { $type: 'string' } },
  },
)
export class Customers extends BaseModel {
  @prop() code?: string;
  @prop() deletedCode?: string;
  @prop({ enum: CustomerCodeStatus, default: CustomerCodeStatus.UNASSIGNED })
  codeStatus: CustomerCodeStatus;
  @prop({ type: () => [CustomerCodeChange], default: [] })
  codeHistory: CustomerCodeChange[];
  @prop({ required: true }) name: string;
  @prop() phone?: string;
  @prop({ type: () => [String], default: [] }) phones: string[];
  @prop() email?: string;
  @prop() address?: string;
  @prop({ default: false }) zaloConnected: boolean;
  @prop({ default: false, index: true }) difficultCustomer: boolean;
  @prop({ enum: CustomerSource, default: CustomerSource.LEAD })
  source: CustomerSource;
  @prop({ enum: CustomerSegment, default: CustomerSegment.NEW_CUSTOMER })
  segment: CustomerSegment;
  @prop({ default: 0, min: 0 }) debt: number;
  @prop({ default: 0, min: 0 }) debtLimit: number;
  @prop({ default: 0 }) invoiceCoinBalance: number;
  @prop({ default: 0 }) plusExCoinBalance: number;
  @prop() note?: string;
  @prop() deleteReason?: string;
  @prop({ type: () => CustomerStoreLocation, _id: false })
  storeLocation?: CustomerStoreLocation;
  @prop({ type: () => CustomerStorefrontImage, _id: false })
  storefrontImage?: CustomerStorefrontImage;
  @prop({ type: () => [CustomerInteraction], default: [] })
  interactions: CustomerInteraction[];
}

export class CustomerCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ required: true, default: 0 }) sequence: number;
}

@index({ date: 1, isDeleted: 1 })
export class InvoiceFollowUpDrafts extends BaseModel {
  @prop({ required: true, index: true }) date: Date;
  @prop({ index: true }) invoiceId?: string;
  @prop() customerId?: string;
  @prop({ enum: ['INVOICE', 'DEBT_PAYMENT', 'CUSTOMER_RETURN'] })
  documentType?: string;
  @prop({ index: true }) documentId?: string;
  @prop() documentCode?: string;
  @prop() customerCode?: string;
  @prop({ required: true }) customerName: string;
  @prop() phone?: string;
  @prop() invoiceCode?: string;
  @prop({ enum: CustomerZaloStatus, default: CustomerZaloStatus.NOT_CONNECTED })
  zaloStatus: CustomerZaloStatus;
  @prop({
    enum: CustomerInvoiceSendStatus,
    default: CustomerInvoiceSendStatus.NOT_SENT,
  })
  invoiceStatus: CustomerInvoiceSendStatus;
  @prop({
    enum: CustomerInteractionChannel,
    default: CustomerInteractionChannel.ZALO,
  })
  interactionChannel: CustomerInteractionChannel;
  @prop() interaction?: string;
  @prop() note?: string;
  @prop({ default: false }) difficultCustomer: boolean;
  @prop() salespersonName?: string;
  @prop() createdBy?: string;
  @prop() updatedBy?: string;
  @prop() lastUpdatedAt?: Date;
}

@index({ date: 1 }, { unique: true })
export class InvoiceFollowUpBooks extends BaseModel {
  @prop({ required: true, unique: true }) date: Date;
  @prop({ required: true, default: false }) isFinalized: boolean;
  @prop() finalizedAt?: Date;
  @prop() finalizedBy?: string;
  @prop({ default: 0 }) sourceInvoiceCount: number;
  @prop({ default: 0 }) trackedInvoiceCount: number;
  @prop({ default: 0 }) interactionCount: number;
}
