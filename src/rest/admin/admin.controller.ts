import { Module } from '@nestjs/common';
import { UsersModule } from 'src/collection/users/users.module';
import { UsersController } from './controllers/users';

@Module({
  imports: [UsersModule],
  controllers: [UsersController],
})
export class AdminModule {}
