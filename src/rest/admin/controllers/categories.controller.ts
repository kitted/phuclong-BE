import { Body, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { CategoriesService } from 'src/collection/categories/categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from 'src/collection/categories/dtos/categories.dto';
import { AdminOnly } from '../decorators/admin-only';

@WarehouseController(['categories'])
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @ApiOperation({ summary: 'Create category' })
  @Post()
  @AdminOnly()
  async create(@Body() dto: CreateCategoryDto) {
    return await this.service.create(dto);
  }

  @ApiOperation({ summary: 'Get all categories' })
  @Get()
  async findAll() {
    return await this.service.findAll();
  }

  @ApiOperation({ summary: 'Get category by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Update category' })
  @Put(':id')
  @AdminOnly()
  async update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateCategoryDto) {
    return await this.service.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete category' })
  @Delete(':id')
  @AdminOnly()
  async remove(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.remove(id);
  }
}
