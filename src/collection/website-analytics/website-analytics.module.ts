import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { WebsiteAnalyticsEvents, WebsiteLandingLeads } from './schemas/website-analytics.schema';
import { WebsiteAnalyticsService } from './website-analytics.service';

@Module({
  imports: [TypegooseModule.forFeature([WebsiteAnalyticsEvents, WebsiteLandingLeads])],
  providers: [WebsiteAnalyticsService],
  exports: [WebsiteAnalyticsService],
})
export class WebsiteAnalyticsModule {}
