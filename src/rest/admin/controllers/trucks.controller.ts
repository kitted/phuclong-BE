import { BadRequestException, Body, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { TrucksService } from '../../../collection/trucks/trucks.service';
import { AvailableDriversQueryDto, AvailableProductsQueryDto, ChangeTruckStatusDto, CreateTruckDto, LoadGoodsDto, ReturnGoodsDto, TruckGoodsReportQueryDto, TruckListQueryDto, TruckToTruckTransferDto, UpdateTruckDto } from '../../../collection/trucks/dtos/trucks.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { AdminOnly } from '../decorators/admin-only';
import { TruckStockSyncService } from '../../../collection/trucks/truck-stock-sync.service'; import { InventoryBackupQueryDto, RestoreTruckInventoryDto, SyncTruckStockDto } from '../../../collection/trucks/dtos/truck-stock-sync.dto';

@WarehouseController(['trucks'])
export class TrucksController {
  constructor(private readonly service: TrucksService, private readonly stockSync: TruckStockSyncService) {}

  @Post() @AdminOnly() @ApiOperation({ summary: 'Create truck' })
  create(@Body() dto: CreateTruckDto) { return this.service.create(dto); }

  @Get() @ApiOperation({ summary: 'Search and paginate trucks' })
  findAll(@Query() query: TruckListQueryDto) { return this.service.findAll(query); }

  @Get('summary') @ApiOperation({ summary: 'Get truck KPI summary' })
  summary() { return this.service.summary(); }

  @Get('available-products') @ApiOperation({ summary: 'Get warehouse products available to load' })
  availableProducts(@Query() query: AvailableProductsQueryDto) { return this.service.availableProducts(query); }

  @Get('available-drivers') @ApiOperation({ summary: 'Get active staff available for truck assignment' })
  availableDrivers(@Query() query: AvailableDriversQueryDto) { return this.service.availableDrivers(query); }

  @Get(':id/stock-check/template') @ApiOperation({ summary: 'Download current truck stock-check template' })
  async stockCheckTemplate(@Param('id', ParseIdPipe) id: ID, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> { const file=await this.service.stockCheckTemplate(String(id));response.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="truck-stock-check-${String(id)}.xlsx"`});return new StreamableFile(file); }

  @Post(':id/stock-check/compare') @ApiOperation({ summary: 'Compare uploaded XLSX quantities without changing inventory' })
  @UseInterceptors(FileInterceptor('file',{limits:{files:1,fileSize:10*1024*1024},fileFilter:(_req,file,callback)=>{if(file.mimetype!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'&&!String(file.originalname).toLowerCase().endsWith('.xlsx'))return callback(new BadRequestException('Chỉ hỗ trợ file .xlsx'),false);callback(null,true);}}))
  compareStockCheck(@Param('id', ParseIdPipe) id: ID,@UploadedFile() file:any,@Req()request:AuthRequest):Promise<any>{return this.service.compareStockCheck(String(id),file,this.currentUserId(request));}

  @Get(':id/inventory-backups') @AdminOnly() @ApiOperation({summary:'List truck inventory backups'}) inventoryBackups(@Param('id',ParseIdPipe)id:ID,@Query()query:InventoryBackupQueryDto):Promise<any>{return this.stockSync.listBackups(String(id),query);}

  @Get(':id/goods-report') @ApiOperation({ summary: 'Aggregate truck sales, gifts and returns by product' })
  goodsReport(@Param('id', ParseIdPipe) id: ID, @Query() query: TruckGoodsReportQueryDto): Promise<any> { return this.service.goodsReport(String(id), query); }

  @Get(':id/goods-report/export') @ApiOperation({ summary: 'Export truck goods report to XLSX' })
  async exportGoodsReport(@Param('id', ParseIdPipe) id: ID, @Query() query: TruckGoodsReportQueryDto, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> { const file=await this.service.exportGoodsReport(String(id),query);response.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="truck-goods-${String(id)}-${query.from||'all'}-${query.to||'all'}.xlsx"`});return new StreamableFile(file); }

  @Get(':id/available-products') @ApiOperation({ summary: 'Get sellable products currently available on a truck' })
  availableTruckProducts(@Param('id', ParseIdPipe) id: ID, @Query() query: AvailableProductsQueryDto) {
    return this.service.availableTruckProducts(String(id), query);
  }

  @Get(':id') @ApiOperation({ summary: 'Get truck and full inventory' })
  findOne(@Param('id', ParseIdPipe) id: ID) { return this.service.findOne(id); }

  @Patch(':id') @AdminOnly() @ApiOperation({ summary: 'Partially update truck' })
  update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateTruckDto) { return this.service.update(id, dto); }

  @Put(':id') @AdminOnly() @ApiOperation({ summary: 'Update truck (backward-compatible)' })
  updateLegacy(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateTruckDto) { return this.service.update(id, dto); }

  @Patch(':id/status') @AdminOnly() @ApiOperation({ summary: 'Change truck operating status' })
  status(@Param('id', ParseIdPipe) id: ID, @Body() dto: ChangeTruckStatusDto) { return this.service.changeStatus(String(id), dto); }

  @Delete(':id') @AdminOnly() @ApiOperation({ summary: 'Delete an empty truck' })
  remove(@Param('id', ParseIdPipe) id: ID) { return this.service.remove(id); }

  @Post(':id/load') @AdminOnly() @ApiOperation({ summary: 'Load warehouse goods to truck transactionally' })
  loadGoods(@Param('id', ParseIdPipe) id: ID, @Body() dto: LoadGoodsDto, @Req() request: AuthRequest) {
    return this.service.loadGoods(id, dto, this.currentUserId(request));
  }

  @Post(':id/return') @AdminOnly() @ApiOperation({ summary: 'Return truck goods to warehouse transactionally' })
  returnGoods(@Param('id', ParseIdPipe) id: ID, @Body() dto: ReturnGoodsDto, @Req() request: AuthRequest) {
    return this.service.returnGoods(id, dto, this.currentUserId(request));
  }

  @Post(':id/transfer/preview') @AdminOnly() @ApiOperation({ summary: 'Preview a truck-to-truck stock transfer' })
  previewTransfer(@Param('id', ParseIdPipe) id: ID, @Body() dto: TruckToTruckTransferDto) { return this.service.previewTruckTransfer(String(id), dto); }

  @Post(':id/transfer') @AdminOnly() @ApiOperation({ summary: 'Transfer stock between trucks transactionally' })
  transfer(@Param('id', ParseIdPipe) id: ID, @Body() dto: TruckToTruckTransferDto, @Req() request: AuthRequest) { return this.service.transferBetweenTrucks(String(id), dto, this.currentUserId(request)); }

  private currentUserId(request: AuthRequest) {
    const user: any = request.user;
    return String(user?.id || user?._id || user?._doc?._id || '');
  }
}

@WarehouseController(['truck-stock-checks'])
export class TruckStockChecksController { constructor(private readonly service:TrucksService,private readonly stockSync:TruckStockSyncService){} private actor(req:AuthRequest){const u:any=req.user,d=u?._doc||u;return String(d?.id||d?._id||'');} @Get(':id/export') @ApiOperation({summary:'Export a saved truck stock-check result'}) async export(@Param('id',ParseIdPipe)id:ID,@Res({passthrough:true})response:Response):Promise<StreamableFile>{const file=await this.service.exportStockCheck(String(id));response.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="truck-stock-check-result-${String(id)}.xlsx"`});return new StreamableFile(file);} @Post(':id/sync/preview') @AdminOnly() preview(@Param('id',ParseIdPipe)id:ID):Promise<any>{return this.stockSync.syncPreview(String(id));} @Post(':id/sync') @AdminOnly() sync(@Param('id',ParseIdPipe)id:ID,@Body()dto:SyncTruckStockDto,@Req()req:AuthRequest):Promise<any>{return this.stockSync.sync(String(id),dto,this.actor(req));} }

@WarehouseController(['truck-inventory-backups'])
export class TruckInventoryBackupsController {constructor(private readonly service:TruckStockSyncService){}private actor(req:AuthRequest){const u:any=req.user,d=u?._doc||u;return String(d?.id||d?._id||'');}@Get(':id')@AdminOnly()detail(@Param('id',ParseIdPipe)id:ID):Promise<any>{return this.service.getBackup(String(id));}@Get(':id/export')@AdminOnly()async export(@Param('id',ParseIdPipe)id:ID,@Res({passthrough:true})response:Response):Promise<StreamableFile>{const file=await this.service.exportBackup(String(id));response.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="truck-inventory-backup-${String(id)}.xlsx"`});return new StreamableFile(file);}@Post(':id/restore/preview')@AdminOnly()preview(@Param('id',ParseIdPipe)id:ID):Promise<any>{return this.service.restorePreview(String(id));}@Post(':id/restore')@AdminOnly()restore(@Param('id',ParseIdPipe)id:ID,@Body()dto:RestoreTruckInventoryDto,@Req()req:AuthRequest):Promise<any>{return this.service.restore(String(id),dto,this.actor(req));}}
