import { Body, Get, Param, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { InvoicesService } from 'src/collection/invoices/invoices.service';
import { CreateInvoiceDto } from 'src/collection/invoices/dtos/invoices.dto';

@WarehouseController(['invoices'])
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @ApiOperation({ summary: 'Create invoice' })
  @Post()
  async create(@Body() dto: CreateInvoiceDto) {
    return await this.service.create(dto);
  }

  @ApiOperation({ summary: 'Get all invoices' })
  @Get()
  async findAll() {
    return await this.service.findAll();
  }

  @ApiOperation({ summary: 'Get invoice by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.findOne(id);
  }
}
