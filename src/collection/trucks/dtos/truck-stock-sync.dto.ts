import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
export class PreviewTruckStockSyncDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  deleteProductIds?: string[];
}
export class SyncTruckStockDto extends PreviewTruckStockSyncDto {
  @ApiProperty() @IsString() @MinLength(1) reason: string;
  @ApiProperty({ example: 'DONG BO TON XE' })
  @IsIn(['DONG BO TON XE'])
  confirmation: string;
  @ApiProperty() @IsString() @MinLength(8) idempotencyKey: string;
}
export class RestoreTruckInventoryDto {
  @ApiProperty() @IsString() @MinLength(1) reason: string;
  @ApiProperty({ example: 'KHOI PHUC TON XE' })
  @IsIn(['KHOI PHUC TON XE'])
  confirmation: string;
  @ApiProperty() @IsString() @MinLength(8) idempotencyKey: string;
}
export class InventoryBackupQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceType?: string;
  @ApiPropertyOptional() @IsOptional() page?: string;
  @ApiPropertyOptional() @IsOptional() limit?: string;
}
