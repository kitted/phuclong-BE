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
import { CategoriesModule } from './collection/categories/categories.module';
import { SuppliersModule } from './collection/suppliers/suppliers.module';
import { ProductsModule } from './collection/products/products.module';
import { TrucksModule } from './collection/trucks/trucks.module';
import { ImportsModule } from './collection/imports/imports.module';
import { InvoicesModule } from './collection/invoices/invoices.module';
import { DashboardModule } from './collection/dashboard/dashboard.module';
import { InventoryModule } from './collection/inventory/inventory.module';
import { CustomersModule } from './collection/customers/customers.module';
import { PromotionsModule } from './collection/promotions/promotions.module';
import { PromotionActivationsModule } from './collection/promotion-activations/promotion-activations.module';
import { EmployeeKpisModule } from './collection/employee-kpis/employee-kpis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypegooseModule.forRoot(process.env.MONGO),
    AuthModule,
    UsersModule,
    CategoriesModule,
    SuppliersModule,
    ProductsModule,
    TrucksModule,
    ImportsModule,
    InvoicesModule,
    DashboardModule,
    InventoryModule,
    CustomersModule,
    PromotionsModule,
    PromotionActivationsModule,
    EmployeeKpisModule,
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
