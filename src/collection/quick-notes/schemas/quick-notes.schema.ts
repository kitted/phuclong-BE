import { index, prop } from '@typegoose/typegoose';
import { BaseModel } from '../../../core/base.model';

@index({ isPinned: -1, pinnedAt: -1, createdAt: -1 })
@index({ targetUserIds: 1, isActive: 1, isDeleted: 1 })
export class QuickNotes extends BaseModel {
  @prop({ required: true, trim: true })
  title: string;

  @prop({ required: true, trim: true })
  content: string;

  @prop({ type: () => [String], default: [] })
  targetUserIds: string[];

  @prop({ default: true })
  isActive: boolean;

  @prop({ default: false })
  isPinned: boolean;

  @prop()
  pinnedAt?: Date;

  @prop({ required: true })
  createdBy: string;

  @prop()
  updatedBy?: string;
}
