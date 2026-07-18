import { Body, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { SuppliersService } from 'src/collection/suppliers/suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from 'src/collection/suppliers/dtos/suppliers.dto';

@WarehouseController(['suppliers'])
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @ApiOperation({ summary: 'Create supplier' })
  @Post()
  async create(@Body() dto: CreateSupplierDto) {
    return await this.service.create(dto);
  }

  @ApiOperation({ summary: 'Get all suppliers' })
  @Get()
  async findAll() {
    return await this.service.findAll();
  }

  @ApiOperation({ summary: 'Get supplier by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Update supplier' })
  @Put(':id')
  async update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateSupplierDto) {
    return await this.service.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete supplier' })
  @Delete(':id')
  async remove(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.remove(id);
  }
}
