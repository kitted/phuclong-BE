import {
  Body,
  Get,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces } from '@nestjs/swagger';
import { WarehouseController } from '../decorators/warehouse';
import { DashboardService } from 'src/collection/dashboard/dashboard.service';
import {
  DashboardPeriodQueryDto,
  NewCustomerCareExportDto,
} from '../../../collection/dashboard/dtos/dashboard.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { Response } from 'express';
@WarehouseController(['dashboard'])
export class DashboardController {
  constructor(private readonly service: DashboardService) {}
  private actor(request: AuthRequest): any {
    const user: any = request.user;
    const document = user?._doc || user;
    return {
      id: String(document?.id || document?._id || user?.id || user?._id || ''),
      role: document?.role || user?.role,
    };
  }
  @Get('stats')
  @ApiOperation({ summary: 'Get legacy dashboard statistics' })
  getStats() {
    return this.service.getStats();
  }
  @Get('overview')
  @ApiOperation({
    summary: 'Get realtime dashboard overview and previous-period comparison',
  })
  overview(
    @Query() query: DashboardPeriodQueryDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.overview(query, this.actor(request));
  }
  @Get('sales-trend') salesTrend(
    @Query() query: DashboardPeriodQueryDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.salesTrend(query, this.actor(request));
  }
  @Get('debt-summary') debtSummary(
    @Query() query: DashboardPeriodQueryDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.debtSummary(query, this.actor(request));
  }
  @Get('inventory-alerts') inventoryAlerts(
    @Query() query: DashboardPeriodQueryDto,
  ) {
    return this.service.inventoryAlerts(query);
  }
  @Get('new-customers') newCustomers(
    @Query() query: DashboardPeriodQueryDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.newCustomers(query, this.actor(request));
  }
  @Post('new-customers/interactions/export')
  @ApiOperation({ summary: 'Export new-customer care interactions to XLSX' })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportNewCustomerCare(
    @Body() query: NewCustomerCareExportDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.exportNewCustomerCare(
      query,
      this.actor(request),
    );
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="BAOCAO-TUONGTAC-KHM-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    });
    return new StreamableFile(file);
  }
  @Get('top-products') topProducts(
    @Query() query: DashboardPeriodQueryDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.topProducts(query, this.actor(request));
  }
  @Get('trucks') trucks(
    @Query() query: DashboardPeriodQueryDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.trucks(query, this.actor(request));
  }
  @Get('customers') customers(
    @Query() query: DashboardPeriodQueryDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.customerMetrics(query, this.actor(request));
  }
  @Get('promotions') promotions(
    @Query() query: DashboardPeriodQueryDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.promotionMetrics(query, this.actor(request));
  }
  @Get('employees') employees(
    @Query() query: DashboardPeriodQueryDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.employeeMetrics(query, this.actor(request));
  }
  @Get('system-health') systemHealth(
    @Query() query: DashboardPeriodQueryDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.systemHealth(query, this.actor(request));
  }
}
