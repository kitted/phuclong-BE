import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ConditionCombination, DiscountType, GiftSelectionMode, PromotionConditionMetric, PromotionConditionOperator, PromotionProductScope, PromotionScope, PromotionStatus, PromotionType, RewardRepeatMode } from '../schemas/promotions.schema';

export class PromotionConditionDto {
  @ApiProperty({ enum: PromotionConditionMetric }) @IsEnum(PromotionConditionMetric) metric: PromotionConditionMetric;
  @ApiPropertyOptional({ enum: PromotionConditionOperator }) @IsOptional() @IsEnum(PromotionConditionOperator) operator?: PromotionConditionOperator;
  @ApiProperty({ enum: PromotionProductScope }) @IsEnum(PromotionProductScope) scope: PromotionProductScope;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() productIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() categoryIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() productType?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() brandIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minimumQuantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minimumAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minimumPoints?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowMixedProducts?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowMixedBrands?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() groupKey?: string;
}
export class PromotionConditionGroupDto {
  @ApiProperty({ enum: ConditionCombination }) @IsEnum(ConditionCombination) combination: ConditionCombination;
  @ApiProperty({ type: [PromotionConditionDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => PromotionConditionDto) conditions: PromotionConditionDto[];
}
export class PromotionGiftGroupDto {
  @ApiProperty() @IsString() @IsNotEmpty() code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiProperty({ enum: GiftSelectionMode }) @IsEnum(GiftSelectionMode) selectionMode: GiftSelectionMode;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) requiredSelectionCount?: number;
  @ApiProperty() @IsNumber() @Min(1) giftQuantity: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() productIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sameAsPurchased?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowMixedProducts?: boolean;
}
export class PromotionContributionRuleDto {
  @ApiProperty({ enum: PromotionProductScope }) @IsEnum(PromotionProductScope) scope: PromotionProductScope;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() productIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() categoryIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() brandIds?: string[];
  @ApiProperty() @IsNumber() @Min(1) quantityPerUnit: number;
  @ApiProperty() @IsNumber() @Min(0) contributionPoints: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxQuantity?: number;
}
export class CreatePromotionDto {
  @ApiProperty() @IsString() @IsNotEmpty() code: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty({ enum: PromotionType }) @IsEnum(PromotionType) type: PromotionType;
  @ApiPropertyOptional({ enum: DiscountType }) @IsOptional() @IsEnum(DiscountType) discountType?: DiscountType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discountValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxDiscount?: number;
  @ApiPropertyOptional({ enum: PromotionScope }) @IsOptional() @IsEnum(PromotionScope) scope?: PromotionScope;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() categoryIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() productType?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() productIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() voucherPrefix?: string;
  @ApiPropertyOptional({ description: 'Short stable prefix used to generate promotion activation codes' }) @IsOptional() @IsString() activationPrefix?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) usageLimitPerCustomer?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minOrderValue?: number;
  @ApiPropertyOptional({ type: [PromotionConditionGroupDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PromotionConditionGroupDto) conditionGroups?: PromotionConditionGroupDto[];
  @ApiPropertyOptional({ type: [PromotionGiftGroupDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PromotionGiftGroupDto) giftGroups?: PromotionGiftGroupDto[];
  @ApiPropertyOptional({ type: [PromotionContributionRuleDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PromotionContributionRuleDto) contributionRules?: PromotionContributionRuleDto[];
  @ApiPropertyOptional({ enum: RewardRepeatMode }) @IsOptional() @IsEnum(RewardRepeatMode) repeatMode?: RewardRepeatMode;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) maxApplicationsPerInvoice?: number;
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
export class PromotionOptionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ description: 'Comma-separated promotion types' }) @IsOptional() @IsString() types?: string;
  @ApiPropertyOptional({ description: 'Comma-separated promotion statuses' }) @IsOptional() @IsString() statuses?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() page?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() limit?: string;
}
export class ChangePromotionStatusDto { @ApiProperty({ enum: PromotionStatus }) @IsEnum(PromotionStatus) status: PromotionStatus; }
export class AssignVoucherDto { @ApiProperty() @IsMongoId() customerId: string; }
export class UseVoucherDto { @ApiProperty() @IsMongoId() customerId: string; @ApiPropertyOptional() @IsOptional() @IsString() orderReference?: string; }
