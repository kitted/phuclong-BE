import { Body, Headers, Post } from '@nestjs/common';
import { CreateWebsiteLandingLeadDto, TrackWebsiteEventDto } from '../../../collection/website-analytics/dtos/website-analytics.dto';
import { WebsiteAnalyticsService } from '../../../collection/website-analytics/website-analytics.service';
import { PublicController } from '../decorators/swagger';

@PublicController(['website/analytics'])
export class WebsiteAnalyticsController {
  constructor(private readonly service: WebsiteAnalyticsService) {}
  @Post('events') track(@Body() dto: TrackWebsiteEventDto, @Headers('user-agent') userAgent?: string, @Headers('referer') referrer?: string) {
    return this.service.track(dto, userAgent, referrer);
  }
  @Post('leads') createLead(@Body() dto: CreateWebsiteLandingLeadDto) {
    return this.service.createLead(dto);
  }
}
