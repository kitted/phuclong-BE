import { Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { WarehouseController } from '../decorators/warehouse';
import { DashboardService } from 'src/collection/dashboard/dashboard.service';

@WarehouseController(['dashboard'])
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @ApiOperation({ summary: 'Get dashboard statistics' })
  @Get('stats')
  async getStats() {
    return await this.service.getStats();
  }
}
