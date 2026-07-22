import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypegooseModule } from 'nestjs-typegoose';
import { Users } from './schemas/users.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';

@Module({
  imports: [TypegooseModule.forFeature([Users, Invoices])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
