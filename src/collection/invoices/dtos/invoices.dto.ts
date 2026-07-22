import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PaymentMethod } from '../schemas/invoices.schema';

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
export class CreateInvoiceDto extends InvoicePreviewDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customer?: string;
  @ApiProperty({ enum: ['warehouse', 'truck'] }) @IsEnum(['warehouse', 'truck']) sourceType: 'warehouse' | 'truck';
  @ApiPropertyOptional() @IsOptional() @IsMongoId() truckId?: string;
  @ApiProperty() @IsMongoId() salespersonId: string;
  @ApiProperty({ type: [InvoicePaymentDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => InvoicePaymentDto) payments: InvoicePaymentDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowDebtLimitOverride?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() debtOverrideReason?: string;
}
