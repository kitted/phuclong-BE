import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CustomerInvoiceSendStatus, CustomerSegment, CustomerSource, CustomerZaloStatus, StoreLocationSource } from '../schemas/customers.schema';
import { Transform, Type } from 'class-transformer';
import { DebtLedgerType } from '../../debt-payments/schemas/customer-debt-ledger.schema';

export class CreateCustomerDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional({ enum: CustomerSource }) @IsOptional() @IsEnum(CustomerSource) source?: CustomerSource;
  @ApiPropertyOptional({ enum: CustomerSegment }) @IsOptional() @IsEnum(CustomerSegment) segment?: CustomerSegment;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() zaloConnected?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) debtLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CustomerQueryDto {
  @ApiPropertyOptional() @IsOptional() search?: string;
  @ApiPropertyOptional({ enum: CustomerSource }) @IsOptional() @IsEnum(CustomerSource) source?: CustomerSource;
  @ApiPropertyOptional({ enum: CustomerSegment }) @IsOptional() @IsEnum(CustomerSegment) segment?: CustomerSegment;
  @ApiPropertyOptional() @IsOptional() zaloConnected?: string;
  @ApiPropertyOptional({ type: Boolean }) @Transform(({ value }) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined) @IsOptional() @IsBoolean() debtWarning?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @Transform(({ value }) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined) @IsOptional() @IsBoolean() hasDebt?: boolean;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() page?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() limit?: string;
}

export class CreateInteractionDto {
  @ApiProperty() @IsString() @IsNotEmpty() channel: string;
  @ApiProperty() @IsString() @IsNotEmpty() action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() result?: string;
}

export class ImportCustomersDto {
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  @IsArray()
  rows: Record<string, unknown>[];
}

export class CustomerDebtHistoryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: DebtLedgerType }) @IsOptional() @IsEnum(DebtLedgerType) type?: DebtLedgerType;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Transform(({ value }) => Number(value)) @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Transform(({ value }) => Number(value)) @Min(1) @Max(100) limit = 20;
}

export class ImportCustomerInteractionRowDto {
  @IsOptional() @IsInt() @Min(1) rowNumber?: number;
  @IsString() @IsNotEmpty() customerCode: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsEnum(CustomerZaloStatus) zaloStatus?: CustomerZaloStatus;
  @IsOptional() @IsEnum(CustomerInvoiceSendStatus) invoiceStatus?: CustomerInvoiceSendStatus;
  @IsOptional() @IsString() interaction?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() note?: string;
  @IsDateString() occurredAt: string;
}

export class ImportCustomerInteractionsDto {
  @ApiProperty({ type: [ImportCustomerInteractionRowDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ImportCustomerInteractionRowDto)
  rows: ImportCustomerInteractionRowDto[];
}

export class UpdateCustomerStoreProfileDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsOptional() @IsNumber() @Min(0) accuracy?: number;
  @IsEnum(StoreLocationSource) source: StoreLocationSource;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsDateString() capturedAt?: string;
}
