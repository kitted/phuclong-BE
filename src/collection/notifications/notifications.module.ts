import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Notifications } from './schemas/notifications.schema';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypegooseModule.forFeature([Notifications])],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
