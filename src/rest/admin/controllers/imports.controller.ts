import { Body, Get, Param, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { ImportsService } from 'src/collection/imports/imports.service';
import { CreateImportDto } from 'src/collection/imports/dtos/imports.dto';

@WarehouseController(['imports'])
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @ApiOperation({ summary: 'Create import' })
  @Post()
  async create(@Body() dto: CreateImportDto) {
    return await this.service.create(dto);
  }

  @ApiOperation({ summary: 'Get all imports' })
  @Get()
  async findAll() {
    return await this.service.findAll();
  }

  @ApiOperation({ summary: 'Get import by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.findOne(id);
  }
}
