import { Body, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { CustomersService } from '../../../collection/customers/customers.service';
import { CreateCustomerDto, CreateInteractionDto, CustomerQueryDto, UpdateCustomerDto } from '../../../collection/customers/dtos/customers.dto';
import { WarehouseController } from '../decorators/warehouse';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';

@WarehouseController(['customers'])
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get() @ApiOperation({ summary: 'Search and filter customers' })
  findAll(@Query() query: CustomerQueryDto): Promise<any> { return this.service.findAll(query); }

  @Get('summary') @ApiOperation({ summary: 'Get customer KPI summary' })
  summary() { return this.service.summary(); }

  @Get(':id') @ApiOperation({ summary: 'Get customer 360 profile' })
  findOne(@Param('id', ParseIdPipe) id: ID) { return this.service.findOne(String(id)); }

  @Post() @ApiOperation({ summary: 'Create customer' })
  create(@Body() dto: CreateCustomerDto) { return this.service.create(dto); }

  @Patch(':id') @ApiOperation({ summary: 'Update customer' })
  update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateCustomerDto) { return this.service.update(String(id), dto); }

  @Post(':id/interactions') @ApiOperation({ summary: 'Record customer interaction' })
  interaction(@Param('id', ParseIdPipe) id: ID, @Body() dto: CreateInteractionDto) { return this.service.addInteraction(String(id), dto); }
}
