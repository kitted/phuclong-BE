import { modelOptions, prop, Severity } from '@typegoose/typegoose';
import { Schema } from 'mongoose';

@modelOptions({
  options: { allowMixed: Severity.ALLOW },
  schemaOptions: {
    timestamps: true,
    toJSON: {
      virtuals: true,
      getters: true,
    },
  },
})
export abstract class BaseModel {
  @prop()
  createdAt: Date;

  @prop()
  updatedAt: Date;

  id: Schema.Types.ObjectId;
  @prop({ default: null })
  deletedAt: Date;

  @prop({ default: null })
  deletedBy: string;

  @prop({ default: false })
  isDeleted: boolean;
}
