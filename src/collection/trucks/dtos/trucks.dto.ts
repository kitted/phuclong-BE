import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Min, ValidateIf, ValidateNested } from 'class-validator';
import { TruckTransferType } from '../schemas/truck-transfers.schema';

export enum TruckStatus { ACTIVE = 'active', INACTIVE = 'inactive' }

export class CreateTruckDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsString() @IsNotEmpty() licensePlate: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf((_, value) => value !== null) @IsMongoId() driverId?: string | null;
  @ApiPropertyOptional({ enum: TruckStatus }) @IsOptional() @IsEnum(TruckStatus) status?: TruckStatus;
}
export class UpdateTruckDto extends PartialType(CreateTruckDto) {}

export class ChangeTruckStatusDto {
  @ApiProperty({ enum: TruckStatus }) @IsEnum(TruckStatus) status: TruckStatus;
}

export class TruckItemDto {
  @ApiProperty() @IsMongoId() productId: string;
  @ApiProperty() @IsInt() @Min(1) qty: number;
}

export class LoadGoodsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiProperty({ type: [TruckItemDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => TruckItemDto) items: TruckItemDto[];
}
export class ReturnGoodsDto extends LoadGoodsDto {}

export class TruckListQueryDto {
  @ApiPropertyOptional() @IsOptional() search?: string;
  @ApiPropertyOptional({ enum: TruckStatus }) @IsOptional() @IsEnum(TruckStatus) status?: TruckStatus;
  @ApiPropertyOptional() @IsOptional() hasInventory?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() driverId?: string;
  @ApiPropertyOptional() @IsOptional() hasDriver?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() page?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() limit?: string;
  @ApiPropertyOptional({ enum: ['createdAt', 'code', 'name'] }) @IsOptional() sortBy?: 'createdAt' | 'code' | 'name';
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() sortOrder?: 'asc' | 'desc';
}

export class AvailableProductsQueryDto {
  @ApiPropertyOptional() @IsOptional() search?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() page?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() limit?: string;
}

export class AvailableDriversQueryDto {
  @ApiPropertyOptional() @IsOptional() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() excludeTruckId?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() limit?: string;
}

export class TruckTransferQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() truckId?: string;
  @ApiPropertyOptional({ enum: TruckTransferType }) @IsOptional() @IsEnum(TruckTransferType) type?: TruckTransferType;
  @ApiPropertyOptional() @IsOptional() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() page?: string;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() limit?: string;
}
