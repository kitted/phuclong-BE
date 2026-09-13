import { Module } from '@nestjs/common';
import { UsersModule } from 'src/collection/users/users.module';
import { UsersController } from './controllers/users.controller';
import { WebsiteOrdersModule } from 'src/collection/website-orders/website-orders.module';
import { WebsiteController } from './controllers/website.controller';
import { WebsiteContentsModule } from 'src/collection/website-contents/website-contents.module';
import { CustomerCoinsModule } from 'src/collection/customer-coins/customer-coins.module';
import { WebsiteAnalyticsModule } from 'src/collection/website-analytics/website-analytics.module';
import { WebsiteAnalyticsController } from './controllers/website-analytics.controller';

@Module({
  imports: [
    UsersModule,
    WebsiteOrdersModule,
    WebsiteContentsModule,
    CustomerCoinsModule,
    WebsiteAnalyticsModule,
  ],
  controllers: [UsersController, WebsiteController, WebsiteAnalyticsController],
})
export class PublicModule {}
