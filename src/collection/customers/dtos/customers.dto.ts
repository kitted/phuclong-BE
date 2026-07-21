import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CustomerSegment, CustomerSource } from '../schemas/customers.schema';

export class CreateCustomerDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsString() @IsNotEmpty() phone: string;
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
  @ApiPropertyOptional() @IsOptional() debtWarning?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() page?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() limit?: string;
}

export class CreateInteractionDto {
  @ApiProperty() @IsString() @IsNotEmpty() channel: string;
  @ApiProperty() @IsString() @IsNotEmpty() action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() result?: string;
}
