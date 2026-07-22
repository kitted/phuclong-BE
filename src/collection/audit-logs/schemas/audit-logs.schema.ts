import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Users } from '../../users/schemas/users.schema';
export enum AuditLogStatus { SUCCESS = 'SUCCESS', FAILED = 'FAILED' }
export enum AuditLogAction { READ = 'READ', CREATE = 'CREATE', UPDATE = 'UPDATE', DELETE = 'DELETE', LOGIN = 'LOGIN', EXPORT = 'EXPORT', OTHER = 'OTHER' }
@index({ occurredAt: -1 })
@index({ actorId: 1, occurredAt: -1 })
@index({ resource: 1, entityId: 1, occurredAt: -1 })
@index({ status: 1, action: 1, occurredAt: -1 })
@index({ correlationId: 1 })
export class AuditLogs extends BaseModel {
  @prop({ required: true, unique: true }) correlationId: string;
  @prop({ required: true }) occurredAt: Date;
  @prop({ enum: AuditLogAction, required: true }) action: AuditLogAction;
  @prop({ enum: AuditLogStatus, required: true }) status: AuditLogStatus;
  @prop({ ref: () => Users }) actorId?: Ref<Users>;
  @prop() actorUsername?: string;
  @prop() actorEmployeeCode?: string;
  @prop() actorFullName?: string;
  @prop() actorRole?: string;
  @prop({ default: false }) authenticated: boolean;
  @prop({ required: true }) method: string;
  @prop({ required: true }) path: string;
  @prop() routeTemplate?: string;
  @prop() controller?: string;
  @prop() handler?: string;
  @prop() resource?: string;
  @prop() entityId?: string;
  @prop() entityCode?: string;
  @prop() description?: string;
  @prop() ipAddress?: string;
  @prop() userAgent?: string;
  @prop() origin?: string;
  @prop() referer?: string;
  @prop() requestQuery?: Record<string, unknown>;
  @prop() requestParams?: Record<string, unknown>;
  @prop() requestBody?: unknown;
  @prop() responseBody?: unknown;
  @prop() changedFields?: string[];
  @prop() httpStatus?: number;
  @prop() durationMs?: number;
  @prop() errorName?: string;
  @prop() errorMessage?: string;
  @prop() errorDetails?: unknown;
  @prop() serverHost?: string;
}
