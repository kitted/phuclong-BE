import { BaseModel } from '../../../core/base.model';
import { prop } from '@typegoose/typegoose';
import { RoleEnum } from '../interfaces/role.enum';
import { Exclude } from 'class-transformer';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export class Users extends BaseModel {
  @prop({ required: true, unique: true })
  username: string;

  @Exclude()
  @prop({ required: true, select: false })
  password: string;

  @prop({ enum: RoleEnum, required: true })
  role: RoleEnum;

  @prop({ required: false })
  fullName?: string;

  @prop({ required: false })
  phone?: string;

  @prop({ required: false, lowercase: true, trim: true })
  email?: string;

  @prop({ enum: UserStatus, default: UserStatus.ACTIVE, index: true })
  status: UserStatus;

  @prop({ required: false, unique: true, sparse: true })
  employeeCode?: string;

  @prop({ required: false })
  note?: string;

  @prop({ required: false })
  lastLoginAt?: Date;
}
