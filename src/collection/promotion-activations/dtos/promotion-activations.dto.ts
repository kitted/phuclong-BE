import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PromotionActivationSource,
  PromotionActivationStatus,
  PromotionStockSource,
} from '../schemas/promotion-activations.schema';

export class PromotionActivationQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() promotionId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() salespersonId?: string;
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional()
  @IsEnum(PromotionActivationStatus)
  status?: PromotionActivationStatus;
  @IsOptional()
  @IsEnum(PromotionActivationSource)
  source?: PromotionActivationSource;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
}
export class ChangePromotionActivationStatusDto {
  @IsEnum(PromotionActivationStatus) status: PromotionActivationStatus;
  @IsOptional() @IsString() reason?: string;
}

export class SaveManualPromotionCodeDto {
  @IsMongoId() productId: string;
  @IsMongoId() customerId: string;
  @IsMongoId() salespersonId: string;
  @IsEnum(PromotionStockSource) stockSource: PromotionStockSource;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  giftQuantity = 1;
  @ValidateIf((value) => value.stockSource === PromotionStockSource.TRUCK)
  @IsMongoId()
  sourceTruckId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_-]+$/)
  prefix?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9/_-]+$/)
  code?: string;
}
