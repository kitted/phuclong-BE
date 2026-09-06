import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ReportPeriodType } from '../../dashboard/dtos/dashboard.dto';
import { CustomerCoinType } from '../schemas/customer-coins.schema';

export class CustomerCoinQueryDto {
  @IsOptional() @IsEnum(ReportPeriodType) period?: ReportPeriodType;
  @IsOptional() @IsString() anchor?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsEnum(CustomerCoinType) coinType?: CustomerCoinType;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
}

export class UpdateProductCoinSettingDto {
  @Type(() => Boolean) @IsBoolean() plusExCoinEnabled: boolean;
}

export class RedeemCustomerCoinDto {
  @IsEnum(CustomerCoinType) coinType: CustomerCoinType;
  @Type(() => Number) @IsInt() @Min(1) amount: number;
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  @IsString() @IsNotEmpty() @MaxLength(200) idempotencyKey: string;
}

export class PublicRedeemCustomerCoinDto extends RedeemCustomerCoinDto {
  @IsString() @IsNotEmpty() customerCode: string;
  @IsString() @IsNotEmpty() phone: string;
}
