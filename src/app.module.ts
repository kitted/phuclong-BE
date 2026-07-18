import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { TypegooseModule } from 'nestjs-typegoose';
import { UsersModule } from './collection/users/users.module';
import mongoose from 'mongoose';
import { SoftDelete } from 'soft-delete-mongoose-plugin';
import { PublicModule } from './rest/public/public.controller';
import { RouterModule } from '@nestjs/core';
import { AuthModule } from './collection/auth/auth.module';
import { AdminModule } from './rest/admin/admin.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypegooseModule.forRoot(process.env.MONGO),
    AuthModule,
    UsersModule,
    PublicModule,
    AdminModule,
    RouterModule.register([
      {
        path: 'public',
        module: PublicModule,
      },
      {
        path: 'admin',
        module: AdminModule,
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  constructor() {
    // mongoose.plugin(
    //   new SoftDelete({
    //     isDeletedField: 'isDeleted',
    //     deletedAtField: 'deletedAt',
    //   }).getPlugin(),
    // );
  }
}
