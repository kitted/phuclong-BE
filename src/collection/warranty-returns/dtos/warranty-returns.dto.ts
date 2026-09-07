import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  WarrantyResolution,
  WarrantyReturnStatus,
  WarrantySourceType,
} from '../schemas/warranty-returns.schema';

export class WarrantyReturnItemDto {
  @IsMongoId() productId: string;
  @Type(() => Number) @IsInt() @Min(1) quantity: number;
  @IsString() @IsNotEmpty() @MaxLength(500) issue: string;
  @IsOptional() @IsString() @MaxLength(200) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CreateWarrantyReturnDto {
  @IsEnum(WarrantySourceType) sourceType: WarrantySourceType;
  @ValidateIf((value) => value.sourceType === WarrantySourceType.TRUCK)
  @IsMongoId()
  sourceTruckId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WarrantyReturnItemDto)
  items: WarrantyReturnItemDto[];
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
  @IsOptional() @IsString() @MaxLength(200) customerName?: string;
  @IsOptional() @IsString() @MaxLength(30) customerPhone?: string;
  @IsOptional() @IsString() @MaxLength(200) supplierName?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey: string;
}

export class CompleteWarrantyReturnDto {
  @IsEnum(WarrantyResolution) resolution: WarrantyResolution;
  @IsString() @IsNotEmpty() @MaxLength(1000) note: string;
}

export class CancelWarrantyReturnDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}

export class WarrantyReturnQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(WarrantySourceType) sourceType?: WarrantySourceType;
  @IsOptional() @IsEnum(WarrantyReturnStatus) status?: WarrantyReturnStatus;
  @IsOptional() @IsMongoId() sourceTruckId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page =
    1;
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  limit = 20;
}
