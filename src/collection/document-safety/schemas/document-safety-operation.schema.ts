import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

export enum DocumentSafetyOperationStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

@index({ idempotencyKey: 1 }, { unique: true })
@index({ activeLockKey: 1 }, { unique: true, sparse: true })
@index({ documentDate: -1, createdAt: -1 })
export class DocumentSafetyOperations extends BaseModel {
  @prop({ required: true, unique: true })
  idempotencyKey: string;

  @prop()
  activeLockKey?: string;

  @prop({ required: true })
  documentDate: string;

  @prop({ required: true })
  periodFrom: Date;

  @prop({ required: true })
  periodTo: Date;

  @prop({ enum: DocumentSafetyOperationStatus, required: true })
  status: DocumentSafetyOperationStatus;

  @prop({ required: true })
  reason: string;

  @prop({ required: true })
  createdBy: string;

  @prop()
  createdByName?: string;

  @prop({ required: true })
  snapshot: Record<string, unknown>;

  @prop()
  result?: Record<string, unknown>;

  @prop()
  completedAt?: Date;

  @prop()
  failedAt?: Date;

  @prop()
  errorMessage?: string;
}
