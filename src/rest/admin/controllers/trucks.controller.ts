import { Body, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { TrucksService } from '../../../collection/trucks/trucks.service';
import { AvailableDriversQueryDto, AvailableProductsQueryDto, ChangeTruckStatusDto, CreateTruckDto, LoadGoodsDto, ReturnGoodsDto, TruckListQueryDto, TruckToTruckTransferDto, UpdateTruckDto } from '../../../collection/trucks/dtos/trucks.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';

@WarehouseController(['trucks'])
export class TrucksController {
  constructor(private readonly service: TrucksService) {}

  @Post() @ApiOperation({ summary: 'Create truck' })
  create(@Body() dto: CreateTruckDto) { return this.service.create(dto); }

  @Get() @ApiOperation({ summary: 'Search and paginate trucks' })
  findAll(@Query() query: TruckListQueryDto) { return this.service.findAll(query); }

  @Get('summary') @ApiOperation({ summary: 'Get truck KPI summary' })
  summary() { return this.service.summary(); }

  @Get('available-products') @ApiOperation({ summary: 'Get warehouse products available to load' })
  availableProducts(@Query() query: AvailableProductsQueryDto) { return this.service.availableProducts(query); }

  @Get('available-drivers') @ApiOperation({ summary: 'Get active staff available for truck assignment' })
  availableDrivers(@Query() query: AvailableDriversQueryDto) { return this.service.availableDrivers(query); }

  @Get(':id/available-products') @ApiOperation({ summary: 'Get sellable products currently available on a truck' })
  availableTruckProducts(@Param('id', ParseIdPipe) id: ID, @Query() query: AvailableProductsQueryDto) {
    return this.service.availableTruckProducts(String(id), query);
  }

  @Get(':id') @ApiOperation({ summary: 'Get truck and full inventory' })
  findOne(@Param('id', ParseIdPipe) id: ID) { return this.service.findOne(id); }

  @Patch(':id') @ApiOperation({ summary: 'Partially update truck' })
  update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateTruckDto) { return this.service.update(id, dto); }

  @Put(':id') @ApiOperation({ summary: 'Update truck (backward-compatible)' })
  updateLegacy(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateTruckDto) { return this.service.update(id, dto); }

  @Patch(':id/status') @ApiOperation({ summary: 'Change truck operating status' })
  status(@Param('id', ParseIdPipe) id: ID, @Body() dto: ChangeTruckStatusDto) { return this.service.changeStatus(String(id), dto); }

  @Delete(':id') @ApiOperation({ summary: 'Delete an empty truck' })
  remove(@Param('id', ParseIdPipe) id: ID) { return this.service.remove(id); }

  @Post(':id/load') @ApiOperation({ summary: 'Load warehouse goods to truck transactionally' })
  loadGoods(@Param('id', ParseIdPipe) id: ID, @Body() dto: LoadGoodsDto, @Req() request: AuthRequest) {
    return this.service.loadGoods(id, dto, this.currentUserId(request));
  }

  @Post(':id/return') @ApiOperation({ summary: 'Return truck goods to warehouse transactionally' })
  returnGoods(@Param('id', ParseIdPipe) id: ID, @Body() dto: ReturnGoodsDto, @Req() request: AuthRequest) {
    return this.service.returnGoods(id, dto, this.currentUserId(request));
  }

  @Post(':id/transfer/preview') @ApiOperation({ summary: 'Preview a truck-to-truck stock transfer' })
  previewTransfer(@Param('id', ParseIdPipe) id: ID, @Body() dto: TruckToTruckTransferDto) { return this.service.previewTruckTransfer(String(id), dto); }

  @Post(':id/transfer') @ApiOperation({ summary: 'Transfer stock between trucks transactionally' })
  transfer(@Param('id', ParseIdPipe) id: ID, @Body() dto: TruckToTruckTransferDto, @Req() request: AuthRequest) { return this.service.transferBetweenTrucks(String(id), dto, this.currentUserId(request)); }

  private currentUserId(request: AuthRequest) {
    const user: any = request.user;
    return String(user?.id || user?._id || user?._doc?._id || '');
  }
}
