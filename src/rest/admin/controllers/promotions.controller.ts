import { Body, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PromotionsService } from '../../../collection/promotions/promotions.service';
import { AssignVoucherDto, ChangePromotionStatusDto, CreatePromotionDto, PromotionOptionsQueryDto, PromotionQueryDto, UpdatePromotionDto, UseVoucherDto } from '../../../collection/promotions/dtos/promotions.dto';
import { WarehouseController } from '../decorators/warehouse';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { AdminOnly } from '../decorators/admin-only';

@WarehouseController(['promotions'])
export class PromotionsController {
  constructor(private readonly service: PromotionsService) {}

  @Get() @ApiOperation({ summary: 'Search and filter promotions' })
  findAll(@Query() query: PromotionQueryDto): Promise<any> { return this.service.findAll(query); }

  @Get('summary') @ApiOperation({ summary: 'Get promotion KPI summary' })
  summary() { return this.service.summary(); }

  @Get('options') @ApiOperation({ summary: 'Get lightweight promotion options for autocomplete' })
  options(@Query() query: PromotionOptionsQueryDto): Promise<any> { return this.service.options(query); }

  @Get(':id') @ApiOperation({ summary: 'Get promotion detail' })
  findOne(@Param('id', ParseIdPipe) id: ID): Promise<any> { return this.service.findOne(String(id)); }

  @Get(':id/performance') @ApiOperation({ summary: 'Get promotion invoice performance' })
  performance(@Param('id', ParseIdPipe) id: ID, @Query('from') from?: string, @Query('to') to?: string) { return this.service.performance(String(id), from, to); }

  @Get(':id/invoices') @ApiOperation({ summary: 'Get invoices using promotion' })
  invoices(@Param('id', ParseIdPipe) id: ID, @Query('page') page?: string, @Query('limit') limit?: string): Promise<any> { return this.service.promotionInvoices(String(id), page, limit); }

  @Post() @AdminOnly() @ApiOperation({ summary: 'Create promotion' })
  create(@Body() dto: CreatePromotionDto) { return this.service.create(dto); }

  @Patch(':id') @AdminOnly() @ApiOperation({ summary: 'Update promotion' })
  update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdatePromotionDto) { return this.service.update(String(id), dto); }

  @Patch(':id/status') @AdminOnly() @ApiOperation({ summary: 'Activate, schedule or pause promotion' })
  status(@Param('id', ParseIdPipe) id: ID, @Body() dto: ChangePromotionStatusDto) { return this.service.changeStatus(String(id), dto.status); }

  @Post(':id/vouchers') @AdminOnly() @ApiOperation({ summary: 'Assign a voucher to customer' })
  assign(@Param('id', ParseIdPipe) id: ID, @Body() dto: AssignVoucherDto) { return this.service.assignVoucher(String(id), dto); }

  @Post('vouchers/:code/use') @AdminOnly() @ApiOperation({ summary: 'Redeem voucher atomically' })
  use(@Param('code') code: string, @Body() dto: UseVoucherDto) { return this.service.useVoucher(code, dto); }
}
