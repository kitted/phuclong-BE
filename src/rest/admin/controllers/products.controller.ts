import {
  Body,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiProduces } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { ProductsService } from 'src/collection/products/products.service';
import {
  CreateProductDto,
  ImportProductsDto,
  ProductListQueryDto,
  UpdateProductDto,
} from 'src/collection/products/dtos/products.dto';
import { Response } from 'express';
import { AdminOnly } from '../decorators/admin-only';

@WarehouseController(['products'])
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @ApiOperation({ summary: 'Create product' })
  @Post()
  @AdminOnly()
  async create(@Body() dto: CreateProductDto) {
    return await this.service.create(dto);
  }

  @ApiOperation({ summary: 'Get all products' })
  @Get()
  async findAll(@Query() query: ProductListQueryDto) {
    return await this.service.findAll(query);
  }

  @ApiOperation({ summary: 'Export all products to XLSX' })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Get('export')
  async export(@Res({ passthrough: true }) response: Response) {
    const file = await this.service.exportExcel();
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    });
    return new StreamableFile(file);
  }

  @ApiOperation({ summary: 'Bulk upsert products parsed from Excel by code' })
  @Post('import')
  @AdminOnly()
  import(@Body() dto: ImportProductsDto) {
    return this.service.importRows(dto.rows);
  }

  @ApiOperation({ summary: 'Preview product import without changing data' })
  @Post('import/preview')
  @AdminOnly()
  previewImport(@Body() dto: ImportProductsDto) {
    return this.service.previewImportRows(dto.rows);
  }

  @ApiOperation({ summary: 'Download the guided product import template' })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Get('import-template')
  async importTemplate(@Res({ passthrough: true }) response: Response) {
    const file = await this.service.importTemplate();
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="product-import-template.xlsx"',
    });
    return new StreamableFile(file);
  }

  @ApiOperation({ summary: 'Get product by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Update product' })
  @Put(':id')
  @AdminOnly()
  async update(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: UpdateProductDto,
  ) {
    return await this.service.update(id, dto);
  }

  @Post(':id/image')
  @AdminOnly()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadImage(@Param('id', ParseIdPipe) id: ID, @UploadedFile() file: any) { return this.service.uploadImage(id, file); }

  @ApiOperation({ summary: 'Delete product' })
  @Delete(':id')
  @AdminOnly()
  async remove(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.remove(id);
  }
}
