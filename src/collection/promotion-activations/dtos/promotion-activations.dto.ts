import { IsEnum, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PromotionActivationStatus } from '../schemas/promotion-activations.schema';

export class PromotionActivationQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() promotionId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() salespersonId?: string;
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional() @IsEnum(PromotionActivationStatus) status?: PromotionActivationStatus;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
}
export class ChangePromotionActivationStatusDto {
  @IsEnum(PromotionActivationStatus) status: PromotionActivationStatus;
  @IsOptional() @IsString() reason?: string;
}
