import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Trucks } from '../../trucks/schemas/trucks.schema';
export class DailyManualAdjustment {
  @prop({ required: true }) type: string;
  @prop({ required: true }) label: string;
  @prop({ required: true }) amount: number;
  @prop() note?: string;
}
@index(
  { reportDate: 1, truckId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      truckId: { $type: 'objectId' },
      isDeleted: false,
    },
  },
)
export class DailyReports extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ required: true }) reportDate: string;
  @prop({ ref: () => Trucks }) truckId?: Ref<Trucks>;
  @prop() truckCode?: string;
  @prop() truckName?: string;
  @prop() truckLicensePlate?: string;
  @prop() driverId?: string;
  @prop() driverName?: string;
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
