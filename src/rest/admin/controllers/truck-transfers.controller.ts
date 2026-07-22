import { Get, Param, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { WarehouseController } from '../decorators/warehouse';
import { TrucksService } from '../../../collection/trucks/trucks.service';
import { TruckTransferQueryDto } from '../../../collection/trucks/dtos/trucks.dto';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';

@WarehouseController(['truck-transfers'])
export class TruckTransfersController {
  constructor(private readonly service: TrucksService) {}

  @Get() @ApiOperation({ summary: 'Search truck load/return history' })
  findAll(@Query() query: TruckTransferQueryDto) { return this.service.findTransfers(query); }

  @Get(':id') @ApiOperation({ summary: 'Get truck transfer detail' })
  findOne(@Param('id', ParseIdPipe) id: ID) { return this.service.findTransfer(String(id)); }
}
