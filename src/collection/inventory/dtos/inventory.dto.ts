import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { InventoryMovementType } from '../schemas/inventory-movement.schema';
import { InventoryStatus } from '../inventory-status';

export { InventoryStatus } from '../inventory-status';

export enum InventorySortBy {
  PRODUCT_CODE = 'productCode',
  PRODUCT_NAME = 'productName',
  WAREHOUSE_QUANTITY = 'warehouseQuantity',
  TRUCK_QUANTITY = 'truckQuantity',
  TOTAL_QUANTITY = 'totalQuantity',
  MIN_STOCK = 'minStock',
  COST_PRICE = 'costPrice',
  WAREHOUSE_STOCK_VALUE = 'warehouseStockValue',
  UPDATED_AT = 'updatedAt',
}

export class InventoryListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: InventoryStatus, default: InventoryStatus.ALL })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: string;

  @ApiPropertyOptional({ enum: InventorySortBy, default: InventorySortBy.PRODUCT_CODE })
  @IsOptional()
  @IsEnum(InventorySortBy)
  sortBy?: InventorySortBy;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class InventorySummaryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;
}

export class InventoryMovementsQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-21' })
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ enum: InventoryMovementType })
  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: string;
}

export class InventoryExportQueryDto extends InventoryListQueryDto {
  @ApiPropertyOptional({ enum: ['xlsx'], default: 'xlsx' })
  @IsOptional()
  @IsEnum(['xlsx'])
  format?: 'xlsx';
}
