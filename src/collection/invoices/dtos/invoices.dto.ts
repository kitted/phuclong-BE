import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { InvoicePaymentStatus, PaymentMethod } from '../schemas/invoices.schema';

export class InvoiceItemDto {
  @ApiProperty() @IsMongoId() productId: string;
  @ApiProperty() @IsInt() @Min(1) qty: number;
}
export class InvoicePaymentDto {
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiProperty() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
export class InvoicePreviewDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() voucherCode?: string;
  @ApiProperty({ type: [InvoiceItemDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceItemDto) items: InvoiceItemDto[];
}
export class GiftSelectionItemDto {
  @ApiProperty() @IsMongoId() productId: string;
  @ApiProperty() @IsInt() @Min(1) qty: number;
}
export class GiftSelectionDto {
  @ApiProperty() @IsString() groupCode: string;
  @ApiProperty({ type: [GiftSelectionItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => GiftSelectionItemDto) items: GiftSelectionItemDto[];
}
export class PromotionApplicationDto {
  @ApiProperty() @IsMongoId() promotionId: string;
  @ApiProperty({ type: [GiftSelectionDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => GiftSelectionDto) giftSelections: GiftSelectionDto[];
}
export class GiftPromotionPreviewDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() customerId?: string;
  @ApiProperty({ type: [InvoiceItemDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceItemDto) items: InvoiceItemDto[];
}
export class ApplyGiftPromotionDto extends GiftPromotionPreviewDto {
  @ApiProperty() @IsMongoId() promotionId: string;
  @ApiProperty({ type: [GiftSelectionDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => GiftSelectionDto) giftSelections: GiftSelectionDto[];
}
export class CreateInvoiceDto extends InvoicePreviewDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customer?: string;
  @ApiProperty({ enum: ['warehouse', 'truck'] }) @IsEnum(['warehouse', 'truck']) sourceType: 'warehouse' | 'truck';
  @ApiPropertyOptional() @IsOptional() @IsMongoId() truckId?: string;
  @ApiPropertyOptional({ description: 'Required for admin; inferred from JWT for staff' }) @IsOptional() @IsMongoId() salespersonId?: string;
  @ApiProperty({ type: [InvoicePaymentDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => InvoicePaymentDto) payments: InvoicePaymentDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowDebtLimitOverride?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() debtOverrideReason?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paymentDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) paymentTermDays?: number;
  @ApiPropertyOptional({ type: [PromotionApplicationDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PromotionApplicationDto) promotionApplications?: PromotionApplicationDto[];
}
export class InvoiceQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() salespersonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: InvoicePaymentStatus }) @IsOptional() @IsEnum(InvoicePaymentStatus) paymentStatus?: InvoicePaymentStatus;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() page?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() limit?: string;
}
