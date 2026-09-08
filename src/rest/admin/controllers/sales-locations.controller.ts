import { Body, Get, Post, Query, Req } from '@nestjs/common';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import {
  CreateSalesLocationDto,
  SalesLocationRouteQueryDto,
} from '../../../collection/sales-locations/dtos/sales-locations.dto';
import { SalesLocationsService } from '../../../collection/sales-locations/sales-locations.service';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['sales-locations'])
export class SalesLocationsController {
  constructor(private readonly service: SalesLocationsService) {}

  private actor(request: AuthRequest): any {
    const value: any = (request.user as any)?._doc || request.user || {};
    return {
      id: String(value.id || value._id || ''),
      name: value.fullName || value.name || value.username,
      username: value.username,
      employeeCode: value.employeeCode,
    };
  }

  @Post('pings')
  capture(
    @Body() dto: CreateSalesLocationDto,
    @Req() request: AuthRequest,
  ): Promise<any> {
    return this.service.capture(dto, this.actor(request));
  }

  @Get('daily')
  @AdminOnly()
  daily(@Query() query: SalesLocationRouteQueryDto): Promise<any> {
    return this.service.daily(query.date, query.salespersonId);
  }

  @Get('me')
  mine(
    @Query() query: SalesLocationRouteQueryDto,
    @Req() request: AuthRequest,
  ): Promise<any> {
    return this.service.mine(query.date, this.actor(request).id);
  }
}
