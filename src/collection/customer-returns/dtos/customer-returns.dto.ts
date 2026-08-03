import { Type, Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RefundMethod, ReturnCondition, UnclassifiedStatus } from '../schemas/customer-returns.schema';

export class ManualReturnProductDto { @IsOptional() @IsString() code?: string; @IsString() @MinLength(1) name: string; @IsString() @MinLength(1) unit: string; }
export class CustomerReturnItemDto {
  @ValidateIf((o) => !o.manualProduct) @IsMongoId() productId?: string;
  @ValidateIf((o) => !o.productId) @ValidateNested() @Type(() => ManualReturnProductDto) manualProduct?: ManualReturnProductDto;
  @IsInt() @Min(1) qty: number; @IsOptional() @IsNumber() @Min(0) previousUnitPrice?: number;
  @IsNumber() @Min(0) returnUnitPrice: number; @IsEnum(ReturnCondition) condition: ReturnCondition; @IsOptional() @IsString() note?: string;
}
export class RefundDto { @IsEnum(RefundMethod) method: RefundMethod; @IsNumber() @Min(0) amount: number; @IsOptional() @IsString() referenceCode?: string; }
export class ReturnSettlementDto { @IsNumber() @Min(0) debtReductionAmount: number; @IsArray() @ValidateNested({ each: true }) @Type(() => RefundDto) refunds: RefundDto[]; }
export class CreateCustomerReturnDto {
  @IsMongoId() customerId: string; @IsMongoId() destinationTruckId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CustomerReturnItemDto) items: CustomerReturnItemDto[];
  @ValidateNested() @Type(() => ReturnSettlementDto) settlement: ReturnSettlementDto;
  @IsOptional() @IsString() reason?: string; @IsOptional() @IsString() priceAdjustmentReason?: string; @IsOptional() @IsString() note?: string;
  @IsString() @MinLength(8) idempotencyKey: string;
}
export class CustomerReturnQueryDto { @IsOptional() @IsMongoId() customerId?: string; @IsOptional() @IsMongoId() destinationTruckId?: string; @IsOptional() @IsString() status?: string; @IsOptional() @Transform(({value}) => Number(value)) @IsInt() @Min(1) page?: number; @IsOptional() @Transform(({value}) => Number(value)) @IsInt() @Min(1) limit?: number; }
export class ReverseCustomerReturnDto { @IsString() @MinLength(1) reason: string; }
export class CreateMappedProductDto { @IsString() code: string; @IsString() name: string; @IsString() unit: string; @IsNumber() @Min(0) sellPrice: number; }
export class MapUnclassifiedDto { @ValidateIf((o) => !o.createProduct) @IsMongoId() productId?: string; @ValidateIf((o) => !o.productId) @ValidateNested() @Type(() => CreateMappedProductDto) createProduct?: CreateMappedProductDto; }
export class UpdateUnclassifiedDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() unit?: string; @IsOptional() @IsEnum(UnclassifiedStatus) status?: UnclassifiedStatus; }
