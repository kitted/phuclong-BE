import { Body, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PromotionsService } from '../../../collection/promotions/promotions.service';
import { AssignVoucherDto, ChangePromotionStatusDto, CreatePromotionDto, PromotionQueryDto, UpdatePromotionDto, UseVoucherDto } from '../../../collection/promotions/dtos/promotions.dto';
import { WarehouseController } from '../decorators/warehouse';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';

@WarehouseController(['promotions'])
export class PromotionsController {
  constructor(private readonly service: PromotionsService) {}

  @Get() @ApiOperation({ summary: 'Search and filter promotions' })
  findAll(@Query() query: PromotionQueryDto): Promise<any> { return this.service.findAll(query); }

  @Get('summary') @ApiOperation({ summary: 'Get promotion KPI summary' })
  summary() { return this.service.summary(); }

  @Get(':id') @ApiOperation({ summary: 'Get promotion detail' })
  findOne(@Param('id', ParseIdPipe) id: ID): Promise<any> { return this.service.findOne(String(id)); }

  @Post() @ApiOperation({ summary: 'Create promotion' })
  create(@Body() dto: CreatePromotionDto) { return this.service.create(dto); }

  @Patch(':id') @ApiOperation({ summary: 'Update promotion' })
  update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdatePromotionDto) { return this.service.update(String(id), dto); }

  @Patch(':id/status') @ApiOperation({ summary: 'Activate, schedule or pause promotion' })
  status(@Param('id', ParseIdPipe) id: ID, @Body() dto: ChangePromotionStatusDto) { return this.service.changeStatus(String(id), dto.status); }

  @Post(':id/vouchers') @ApiOperation({ summary: 'Assign a voucher to customer' })
  assign(@Param('id', ParseIdPipe) id: ID, @Body() dto: AssignVoucherDto) { return this.service.assignVoucher(String(id), dto); }

  @Post('vouchers/:code/use') @ApiOperation({ summary: 'Redeem voucher atomically' })
  use(@Param('code') code: string, @Body() dto: UseVoucherDto) { return this.service.useVoucher(code, dto); }
}
