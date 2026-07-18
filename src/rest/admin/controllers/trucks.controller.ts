import { Body, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { TrucksService } from 'src/collection/trucks/trucks.service';
import { CreateTruckDto, UpdateTruckDto, LoadGoodsDto, ReturnGoodsDto } from 'src/collection/trucks/dtos/trucks.dto';

@WarehouseController(['trucks'])
export class TrucksController {
  constructor(private readonly service: TrucksService) {}

  @ApiOperation({ summary: 'Create truck' })
  @Post()
  async create(@Body() dto: CreateTruckDto) {
    return await this.service.create(dto);
  }

  @ApiOperation({ summary: 'Get all trucks' })
  @Get()
  async findAll() {
    return await this.service.findAll();
  }

  @ApiOperation({ summary: 'Get truck by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Update truck' })
  @Put(':id')
  async update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateTruckDto) {
    return await this.service.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete truck' })
  @Delete(':id')
  async remove(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.remove(id);
  }

  @ApiOperation({ summary: 'Load goods to truck' })
  @Post(':id/load')
  async loadGoods(@Param('id', ParseIdPipe) id: ID, @Body() dto: LoadGoodsDto) {
    return await this.service.loadGoods(id, dto);
  }

  @ApiOperation({ summary: 'Return goods from truck to warehouse' })
  @Post(':id/return')
  async returnGoods(@Param('id', ParseIdPipe) id: ID, @Body() dto: ReturnGoodsDto) {
    return await this.service.returnGoods(id, dto);
  }
}
