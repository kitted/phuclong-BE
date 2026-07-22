import { Body, Get, Param, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces } from '@nestjs/swagger';
import { WarehouseController } from '../decorators/warehouse';
import { TrucksService } from '../../../collection/trucks/trucks.service';
import { ReverseTruckTransferDto, TruckTransferQueryDto } from '../../../collection/trucks/dtos/trucks.dto';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { Response } from 'express';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';

@WarehouseController(['truck-transfers'])
export class TruckTransfersController {
  constructor(private readonly service: TrucksService) {}

  @Get() @ApiOperation({ summary: 'Search truck load/return history' })
  findAll(@Query() query: TruckTransferQueryDto) { return this.service.findTransfers(query); }

  @Get('summary') @ApiOperation({ summary: 'Get truck transfer summary' })
  summary(@Query() query: TruckTransferQueryDto) { return this.service.transferSummary(query); }

  @Get('export') @ApiOperation({ summary: 'Export filtered truck transfers to XLSX' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async export(@Query() query: TruckTransferQueryDto, @Res({ passthrough: true }) response: Response) {
    const file = await this.service.exportTransfers(query);
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="truck-transfers-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    });
    return new StreamableFile(file);
  }

  @Get(':id') @ApiOperation({ summary: 'Get truck transfer detail' })
  findOne(@Param('id', ParseIdPipe) id: ID) { return this.service.findTransfer(String(id)); }

  @Post(':id/reverse') @ApiOperation({ summary: 'Create a reverse truck-to-truck transfer' })
  reverse(@Param('id', ParseIdPipe) id: ID, @Body() dto: ReverseTruckTransferDto, @Req() request: AuthRequest) { const user: any = request.user; return this.service.reverseTruckTransfer(String(id), dto, String(user?.id || user?._id || '')); }
}
