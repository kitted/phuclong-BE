import {
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class PreviewWarehouseStockSyncDto {
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  deleteProductIds?: string[];
}

export class SyncWarehouseStockDto extends PreviewWarehouseStockSyncDto {
  @IsString() @MinLength(1) reason: string;
  @IsIn(['DONG BO TON KHO']) confirmation: string;
  @IsString() @MinLength(8) idempotencyKey: string;
}
export class RestoreWarehouseStockDto {
  @IsString() @MinLength(1) reason: string;
  @IsIn(['KHOI PHUC TON KHO']) confirmation: string;
  @IsString() @MinLength(8) idempotencyKey: string;
}
export class WarehouseBackupQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() page?: string;
  @IsOptional() limit?: string;
}
