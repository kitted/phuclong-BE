import { Get, Query } from '@nestjs/common';
import { WebsiteAnalyticsQueryDto } from '../../../collection/website-analytics/dtos/website-analytics.dto';
import { WebsiteAnalyticsService } from '../../../collection/website-analytics/website-analytics.service';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['website-analytics'])
export class WebsiteAnalyticsController {
  constructor(private readonly service: WebsiteAnalyticsService) {}
  @Get() @AdminOnly() report(@Query() query: WebsiteAnalyticsQueryDto): Promise<any> {
    return this.service.report(query);
  }
}
