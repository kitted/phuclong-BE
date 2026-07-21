import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { DiscountType, PromotionScope, PromotionStatus, PromotionType } from '../schemas/promotions.schema';

export class CreatePromotionDto {
  @ApiProperty() @IsString() @IsNotEmpty() code: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty({ enum: PromotionType }) @IsEnum(PromotionType) type: PromotionType;
  @ApiProperty({ enum: DiscountType }) @IsEnum(DiscountType) discountType: DiscountType;
  @ApiProperty() @IsNumber() @Min(0) discountValue: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxDiscount?: number;
  @ApiProperty({ enum: PromotionScope }) @IsEnum(PromotionScope) scope: PromotionScope;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() categoryIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() productType?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() productIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() voucherPrefix?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) usageLimitPerCustomer?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minOrderValue?: number;
  @ApiProperty() @IsNotEmpty() startAt: string;
  @ApiProperty() @IsNotEmpty() endAt: string;
  @ApiPropertyOptional({ enum: PromotionStatus }) @IsOptional() @IsEnum(PromotionStatus) status?: PromotionStatus;
}
export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}

export class PromotionQueryDto {
  @ApiPropertyOptional() @IsOptional() search?: string;
  @ApiPropertyOptional({ enum: PromotionStatus }) @IsOptional() @IsEnum(PromotionStatus) status?: PromotionStatus;
  @ApiPropertyOptional({ enum: PromotionType }) @IsOptional() @IsEnum(PromotionType) type?: PromotionType;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() page?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() limit?: string;
}
export class ChangePromotionStatusDto {
  @ApiProperty({ enum: PromotionStatus }) @IsEnum(PromotionStatus) status: PromotionStatus;
}
export class AssignVoucherDto {
  @ApiProperty() @IsMongoId() customerId: string;
}
export class UseVoucherDto {
  @ApiProperty() @IsMongoId() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orderReference?: string;
}
