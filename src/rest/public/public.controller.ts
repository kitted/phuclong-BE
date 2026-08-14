import { Module } from '@nestjs/common';
import { UsersModule } from 'src/collection/users/users.module';
import { UsersController } from './controllers/users.controller';
import { WebsiteOrdersModule } from 'src/collection/website-orders/website-orders.module';
import { WebsiteController } from './controllers/website.controller';
import { WebsiteContentsModule } from 'src/collection/website-contents/website-contents.module';

@Module({
  imports: [UsersModule, WebsiteOrdersModule, WebsiteContentsModule],
  controllers: [UsersController, WebsiteController],
})
export class PublicModule {}
