import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
export class DailyManualAdjustment {
  @prop({ required: true }) type: string;
  @prop({ required: true }) label: string;
  @prop({ required: true }) amount: number;
  @prop() note?: string;
}
@index({ reportDate: 1 }, { unique: true })
export class DailyReports extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ required: true }) reportDate: string;
  @prop({ required: true }) periodFrom: Date;
  @prop({ required: true }) periodTo: Date;
  @prop() area?: string;
  @prop() performerName?: string;
  @prop() vehicle?: string;
  @prop({ required: true }) snapshot: Record<string, unknown>;
  @prop({ type: () => [DailyManualAdjustment], default: [] })
  manualAdjustments: DailyManualAdjustment[];
  @prop() notes?: string;
  @prop() issues?: string;
  @prop({ required: true }) createdBy: string;
  @prop() updatedBy?: string;
}
export class DailyReportCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ required: true, default: 0 }) sequence: number;
}
