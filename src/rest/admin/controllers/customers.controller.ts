import { Body, Get, Param, Patch, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces } from '@nestjs/swagger';
import { CustomersService } from '../../../collection/customers/customers.service';
import { CreateCustomerDto, CreateInteractionDto, CustomerQueryDto, ImportCustomersDto, UpdateCustomerDto } from '../../../collection/customers/dtos/customers.dto';
import { WarehouseController } from '../decorators/warehouse';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { Response } from 'express';
import { PromotionActivationsService } from '../../../collection/promotion-activations/promotion-activations.service';
import { PromotionActivationQueryDto } from '../../../collection/promotion-activations/dtos/promotion-activations.dto';
import { DebtPaymentsService } from '../../../collection/debt-payments/debt-payments.service';
import { CreateDebtPaymentDto, DebtPaymentQueryDto } from '../../../collection/debt-payments/dtos/debt-payments.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { AdminOnly } from '../decorators/admin-only';

@WarehouseController(['customers'])
export class CustomersController {
  constructor(private readonly service: CustomersService, private readonly activations: PromotionActivationsService, private readonly debtPayments: DebtPaymentsService) {}

  @Get() @ApiOperation({ summary: 'Search and filter customers' })
  findAll(@Query() query: CustomerQueryDto): Promise<any> { return this.service.findAll(query); }

  @Get('summary') @ApiOperation({ summary: 'Get customer KPI summary' })
  summary() { return this.service.summary(); }

  @Get('export') @ApiOperation({ summary: 'Export all customers to XLSX' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async export(@Res({ passthrough: true }) response: Response) {
    const file = await this.service.exportExcel();
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    });
    return new StreamableFile(file);
  }

  @Get(':id/promotion-activations') @ApiOperation({ summary: 'Get promotion activations of customer' })
  activationsOfCustomer(@Param('id', ParseIdPipe) id: ID, @Query() query: PromotionActivationQueryDto): Promise<any> { return this.activations.findAll({ ...query, customerId: String(id) }); }

  @Post(':id/debt-payments') @AdminOnly() @ApiOperation({ summary: 'Collect and allocate customer debt payment' })
  createDebtPayment(@Param('id', ParseIdPipe) id: ID, @Body() dto: CreateDebtPaymentDto, @Req() request: AuthRequest): Promise<any> { const user: any = request.user; return this.debtPayments.create(String(id), dto, String(user?.id || user?._id || '')); }

  @Get(':id/debt-payments') @ApiOperation({ summary: 'Get customer debt payment history' })
  customerDebtPayments(@Param('id', ParseIdPipe) id: ID, @Query() query: DebtPaymentQueryDto): Promise<any> { return this.debtPayments.findAll({ ...query, customerId: String(id) }); }

  @Post('import') @AdminOnly() @ApiOperation({ summary: 'Bulk upsert customers parsed from Excel by phone' })
  import(@Body() dto: ImportCustomersDto) { return this.service.importRows(dto.rows); }

  @Get(':id') @ApiOperation({ summary: 'Get customer 360 profile' })
  findOne(@Param('id', ParseIdPipe) id: ID) { return this.service.findOne(String(id)); }

  @Post() @AdminOnly() @ApiOperation({ summary: 'Create customer' })
  create(@Body() dto: CreateCustomerDto) { return this.service.create(dto); }

  @Patch(':id') @AdminOnly() @ApiOperation({ summary: 'Update customer' })
  update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateCustomerDto) { return this.service.update(String(id), dto); }

  @Post(':id/interactions') @AdminOnly() @ApiOperation({ summary: 'Record customer interaction' })
  interaction(@Param('id', ParseIdPipe) id: ID, @Body() dto: CreateInteractionDto) { return this.service.addInteraction(String(id), dto); }
}
