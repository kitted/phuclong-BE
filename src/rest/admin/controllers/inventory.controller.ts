/* eslint-disable @typescript-eslint/no-base-to-string */
import {
  BadRequestException,
  Body,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { WarehouseStockCheckService } from '../../../collection/inventory/warehouse-stock-check.service';
import {
  RestoreWarehouseStockDto,
  SyncWarehouseStockDto,
  WarehouseBackupQueryDto,
} from '../../../collection/inventory/dtos/warehouse-stock-check.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { AdminOnly } from '../decorators/admin-only';

@WarehouseController(['inventory'])
export class InventoryController {
  constructor(
    private readonly service: InventoryService,
    private readonly stockCheck: WarehouseStockCheckService,
  ) {}

  @Get('stock-check/template')
  @ApiOperation({ summary: 'Download warehouse stock-check template' })
  async stockCheckTemplate(@Res({ passthrough: true }) response: Response) {
    const file = await this.stockCheck.template();
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="warehouse-stock-check.xlsx"',
    });
    return new StreamableFile(file);
  }
  @Post('stock-check/compare')
  @ApiOperation({
    summary: 'Compare warehouse stock from XLSX without changing inventory',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!String(file.originalname).toLowerCase().endsWith('.xlsx'))
          return cb(new BadRequestException('Chỉ hỗ trợ file .xlsx'), false);
        cb(null, true);
      },
    }),
  )
  compare(@UploadedFile() file: any, @Req() req: AuthRequest) {
    const u: any = req.user,
      d = u?._doc || u;
    return this.stockCheck.compare(file, String(d?.id || d?._id || ''));
  }

  @Get('backups') @AdminOnly() backups(
    @Query() query: WarehouseBackupQueryDto,
  ) {
    return this.stockCheck.listBackups(query);
  }

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

@WarehouseController(['inventory-stock-checks'])
export class InventoryStockChecksController {
  constructor(private service: WarehouseStockCheckService) {}
  private actor(req: AuthRequest) {
    const u: any = req.user,
      d = u?._doc || u;
    return String(d?.id || d?._id || '');
  }
  @Get(':id/export') async export(
    @Param('id', ParseIdPipe) id: ID,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.exportCheck(String(id));
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="warehouse-stock-check-${String(id)}.xlsx"`,
    });
    return new StreamableFile(file);
  }
  @Post(':id/sync/preview') @AdminOnly() preview(
    @Param('id', ParseIdPipe) id: ID,
  ) {
    return this.service.syncPreview(String(id));
  }
  @Post(':id/sync') @AdminOnly() sync(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: SyncWarehouseStockDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.sync(String(id), dto, this.actor(req));
  }
}
@WarehouseController(['inventory-backups'])
export class InventoryBackupsController {
  constructor(private service: WarehouseStockCheckService) {}
  private actor(req: AuthRequest) {
    const u: any = req.user,
      d = u?._doc || u;
    return String(d?.id || d?._id || '');
  }
  @Get(':id') @AdminOnly() detail(@Param('id', ParseIdPipe) id: ID) {
    return this.service.getBackup(String(id));
  }
  @Get(':id/export') @AdminOnly() async export(
    @Param('id', ParseIdPipe) id: ID,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.exportBackup(String(id));
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="warehouse-inventory-backup-${String(id)}.xlsx"`,
    });
    return new StreamableFile(file);
  }
  @Post(':id/restore/preview') @AdminOnly() preview(
    @Param('id', ParseIdPipe) id: ID,
  ) {
    return this.service.restorePreview(String(id));
  }
  @Post(':id/restore') @AdminOnly() restore(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: RestoreWarehouseStockDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.restore(String(id), dto, this.actor(req));
  }
}
