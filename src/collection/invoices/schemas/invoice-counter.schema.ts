import { prop } from '@typegoose/typegoose';

export class InvoiceCounters {
  @prop({ required: true, unique: true }) key: string;
  @prop({ required: true, default: 0 }) sequence: number;
}
