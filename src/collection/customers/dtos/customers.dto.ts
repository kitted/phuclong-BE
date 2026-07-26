import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { CustomerSegment, CustomerSource } from '../schemas/customers.schema';
import { Transform } from 'class-transformer';
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
