/* eslint-disable @typescript-eslint/no-base-to-string */
import { Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces } from '@nestjs/swagger';
import { Response } from 'express';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { InventoryService } from '../../../collection/inventory/inventory.service';
import {
  InventoryExportQueryDto,
  InventoryListQueryDto,
  InventoryMovementsQueryDto,
  InventorySummaryQueryDto,
} from '../../../collection/inventory/dtos/inventory.dto';

@WarehouseController(['inventory'])
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @ApiOperation({ summary: 'Get inventory list' })
  @Get()
  getList(@Query() query: InventoryListQueryDto) {
    return this.service.getList(query);
  }

  @ApiOperation({ summary: 'Get inventory summary' })
  @Get('summary')
  getSummary(@Query() query: InventorySummaryQueryDto) {
    return this.service.getSummary(query);
  }

  @ApiOperation({ summary: 'Export inventory report to XLSX' })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Get('export')
  async export(
    @Query() query: InventoryExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.export(query);
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="inventory-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    });
    return new StreamableFile(file);
  }

  @ApiOperation({ summary: 'Get inventory detail by product' })
  @Get('products/:productId')
  getProductDetail(@Param('productId', ParseIdPipe) productId: ID) {
    return this.service.getProductDetail(String(productId));
  }

  @ApiOperation({ summary: 'Get product inventory movements' })
  @Get('products/:productId/movements')
  getProductMovements(
    @Param('productId', ParseIdPipe) productId: ID,
    @Query() query: InventoryMovementsQueryDto,
  ) {
    return this.service.getProductMovements(String(productId), query);
  }
}
