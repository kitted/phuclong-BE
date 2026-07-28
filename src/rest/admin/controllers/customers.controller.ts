import { BadRequestException, Body, Delete, Get, Param, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiProduces } from '@nestjs/swagger';
import { CustomersService } from '../../../collection/customers/customers.service';
import { CreateCustomerDto, CreateInteractionDto, CustomerDebtHistoryQueryDto, CustomerQueryDto, DeleteCustomerDto, ImportCustomerInteractionsDto, ImportCustomersDto, UpdateCustomerCodeDto, UpdateCustomerDto, UpdateCustomerStoreProfileDto } from '../../../collection/customers/dtos/customers.dto';
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

  @Post('interactions/import') @AdminOnly() @ApiOperation({ summary: 'Import customer interaction history by customer code' })
  importInteractions(@Body() dto: ImportCustomerInteractionsDto, @Req() request: AuthRequest) {
    const user: any = request.user; const doc = user?._doc || user;
    return this.service.importInteractions(dto.rows, String(doc?.id || doc?._id || ''));
  }

  @Get('interactions/export') @AdminOnly() @ApiOperation({ summary: 'Export customer interaction history to XLSX' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportInteractions(@Res({ passthrough: true }) response: Response) {
    const file = await this.service.exportInteractions();
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="customer-interactions-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    });
    return new StreamableFile(file);
  }

  @Patch(':id/store-profile') @ApiOperation({ summary: 'Update customer storefront location' })
  updateStoreProfile(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateCustomerStoreProfileDto, @Req() request: AuthRequest) {
    const user: any = request.user; const doc = user?._doc || user;
    return this.service.updateStoreProfile(String(id), dto, String(doc?.id || doc?._id || ''));
  }

  @Delete(':id/store-profile') @ApiOperation({ summary: 'Delete customer storefront location' })
  deleteStoreProfile(@Param('id', ParseIdPipe) id: ID, @Req() request: AuthRequest) {
    const user: any = request.user; const doc = user?._doc || user;
    return this.service.deleteStoreProfile(String(id), String(doc?.id || doc?._id || ''));
  }

  @Post(':id/storefront-image') @ApiOperation({ summary: 'Upload or replace customer storefront image' })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(new BadRequestException('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP'), false);
      callback(null, true);
    },
  }))
  uploadStorefrontImage(@Param('id', ParseIdPipe) id: ID, @UploadedFile() file: any, @Req() request: AuthRequest) {
    const user: any = request.user; const doc = user?._doc || user;
    return this.service.uploadStorefrontImage(String(id), file, String(doc?.id || doc?._id || ''));
  }

  @Delete(':id/storefront-image') @ApiOperation({ summary: 'Delete customer storefront image' })
  deleteStorefrontImage(@Param('id', ParseIdPipe) id: ID, @Req() request: AuthRequest) {
    const user: any = request.user; const doc = user?._doc || user;
    return this.service.deleteStorefrontImage(String(id), String(doc?.id || doc?._id || ''));
  }

  @Get(':id/promotion-activations') @ApiOperation({ summary: 'Get promotion activations of customer' })
  activationsOfCustomer(@Param('id', ParseIdPipe) id: ID, @Query() query: PromotionActivationQueryDto): Promise<any> { return this.activations.findAll({ ...query, customerId: String(id) }); }

  @Post(':id/debt-payments') @ApiOperation({ summary: 'Collect and allocate customer debt payment' })
  createDebtPayment(@Param('id', ParseIdPipe) id: ID, @Body() dto: CreateDebtPaymentDto, @Req() request: AuthRequest): Promise<any> { const user: any = request.user; const doc = user?._doc || user; return this.debtPayments.create(String(id), dto, { id: String(doc?.id || doc?._id || ''), role: doc?.role }); }

  @Get(':id/debt-payments') @ApiOperation({ summary: 'Get customer debt payment history' })
  customerDebtPayments(@Param('id', ParseIdPipe) id: ID, @Query() query: DebtPaymentQueryDto): Promise<any> { return this.debtPayments.findAll({ ...query, customerId: String(id) }); }

  @Get(':id/debt-history/chart') @ApiOperation({ summary: 'Get customer debt history chart' })
  debtHistoryChart(@Param('id', ParseIdPipe) id: ID, @Query() query: CustomerDebtHistoryQueryDto) { return this.service.debtHistoryChart(String(id), query); }

  @Get(':id/debt-history') @ApiOperation({ summary: 'Get paginated customer debt history' })
  debtHistory(@Param('id', ParseIdPipe) id: ID, @Query() query: CustomerDebtHistoryQueryDto) { return this.service.debtHistory(String(id), query); }

  @Post('import') @AdminOnly() @ApiOperation({ summary: 'Bulk upsert customers parsed from Excel by customer code' })
  import(@Body() dto: ImportCustomersDto, @Req() request: AuthRequest) { const user: any = request.user; const doc = user?._doc || user; return this.service.importRows(dto.rows, String(doc?.id || doc?._id || '')); }

  @Patch(':id/code') @AdminOnly() @ApiOperation({ summary: 'Assign or change customer code without rewriting historical snapshots' })
  updateCode(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateCustomerCodeDto, @Req() request: AuthRequest) {
    const user: any = request.user; const doc = user?._doc || user;
    return this.service.updateCode(String(id), dto.code, dto.reason, String(doc?.id || doc?._id || ''));
  }

  @Get(':id') @ApiOperation({ summary: 'Get customer 360 profile' })
  findOne(@Param('id', ParseIdPipe) id: ID) { return this.service.findOne(String(id)); }

  @Post() @AdminOnly() @ApiOperation({ summary: 'Create customer' })
  create(@Body() dto: CreateCustomerDto) { return this.service.create(dto); }

  @Patch(':id') @AdminOnly() @ApiOperation({ summary: 'Update customer' })
  update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateCustomerDto) { return this.service.update(String(id), dto); }

  @Delete(':id') @AdminOnly() @ApiOperation({ summary: 'Soft-delete a debt-free customer' })
  remove(@Param('id', ParseIdPipe) id: ID, @Body() dto: DeleteCustomerDto, @Req() request: AuthRequest) {
    const user: any = request.user; const doc = user?._doc || user;
    return this.service.deleteCustomer(String(id), dto.reason, String(doc?.id || doc?._id || ''));
  }

  @Post(':id/interactions') @AdminOnly() @ApiOperation({ summary: 'Record customer interaction' })
  interaction(@Param('id', ParseIdPipe) id: ID, @Body() dto: CreateInteractionDto) { return this.service.addInteraction(String(id), dto); }
}
