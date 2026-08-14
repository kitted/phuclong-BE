import { index, prop, Ref } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';
import { Users } from '../../users/schemas/users.schema';
import { Promotions } from '../../promotions/schemas/promotions.schema';
import { Products } from '../../products/schemas/products.schema';
import { Categories } from '../../categories/schemas/categories.schema';
import { Types } from 'mongoose';
export enum EmployeeKpiMetric {
  PROMOTION_ACTIVATION_COUNT = 'PROMOTION_ACTIVATION_COUNT',
  PRODUCT_REVENUE = 'PRODUCT_REVENUE',
  PRODUCT_QUANTITY = 'PRODUCT_QUANTITY',
  TOTAL_REVENUE = 'TOTAL_REVENUE',
  INVOICE_COUNT = 'INVOICE_COUNT',
}
export enum EmployeeKpiStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
export class EmployeeKpiTarget {
  @prop({ enum: EmployeeKpiMetric, required: true }) metric: EmployeeKpiMetric;
  @prop({ required: true, min: 0 }) targetValue: number;
  @prop({ ref: () => Promotions }) promotionId?: Ref<Promotions>;
  @prop({ ref: () => Products, type: () => [Types.ObjectId], default: [] })
  productIds: Ref<Products>[];
  @prop({ ref: () => Categories, type: () => [Types.ObjectId], default: [] })
  categoryIds: Ref<Categories>[];
  @prop({ type: () => [String], default: [] }) brandIds: string[];
  @prop() productType?: string;
  @prop({ default: false }) includeGiftLines: boolean;
  @prop({ min: 0 }) referenceUnitPrice?: number;
  @prop({ min: 0 }) revenueTarget?: number;
  @prop() note?: string;
}
@index({ employeeId: 1, from: -1, to: -1 })
export class EmployeeKpis extends BaseModel {
  @prop({ required: true, unique: true }) code: string;
  @prop({ required: true }) name: string;
  @prop({ ref: () => Users, required: true }) employeeId: Ref<Users>;
  @prop({ required: true }) employeeCode: string;
  @prop({ required: true }) employeeName: string;
  @prop({ required: true }) from: Date;
  @prop({ required: true }) to: Date;
  @prop({ enum: ['FIXED_RANGE', 'CUSTOM_MONTHLY'], default: 'FIXED_RANGE' })
  cycleType: string;
  @prop({ min: 1, max: 31 }) startDay?: number;
  @prop({ min: 1, max: 31 }) endDay?: number;
  @prop({ type: () => [EmployeeKpiTarget], default: [] })
  targets: EmployeeKpiTarget[];
  @prop({ enum: EmployeeKpiStatus, default: EmployeeKpiStatus.DRAFT })
  status: EmployeeKpiStatus;
  @prop() note?: string;
  @prop({ ref: () => Users }) createdBy?: Ref<Users>;
}
export class EmployeeKpiCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ default: 0 }) sequence: number;
}
