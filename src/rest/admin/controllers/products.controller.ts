import { Body, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { ProductsService } from 'src/collection/products/products.service';
import { CreateProductDto, UpdateProductDto } from 'src/collection/products/dtos/products.dto';

@WarehouseController(['products'])
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @ApiOperation({ summary: 'Create product' })
  @Post()
  async create(@Body() dto: CreateProductDto) {
    return await this.service.create(dto);
  }

  @ApiOperation({ summary: 'Get all products' })
  @Get()
  async findAll() {
    return await this.service.findAll();
  }

  @ApiOperation({ summary: 'Get product by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Update product' })
  @Put(':id')
  async update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateProductDto) {
    return await this.service.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete product' })
  @Delete(':id')
  async remove(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.remove(id);
  }
}
