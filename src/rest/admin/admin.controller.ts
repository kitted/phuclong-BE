import { Module } from '@nestjs/common';
import { UsersModule } from 'src/collection/users/users.module';
import { CategoriesModule } from 'src/collection/categories/categories.module';
import { SuppliersModule } from 'src/collection/suppliers/suppliers.module';
import { ProductsModule } from 'src/collection/products/products.module';
import { TrucksModule } from 'src/collection/trucks/trucks.module';
import { ImportsModule } from 'src/collection/imports/imports.module';
import { InvoicesModule } from 'src/collection/invoices/invoices.module';
import { DashboardModule } from 'src/collection/dashboard/dashboard.module';
import { InventoryModule } from 'src/collection/inventory/inventory.module';

import { UsersController } from './controllers/users';
import { CategoriesController } from './controllers/categories.controller';
import { SuppliersController } from './controllers/suppliers.controller';
import { ProductsController } from './controllers/products.controller';
import { TrucksController } from './controllers/trucks.controller';
import { ImportsController } from './controllers/imports.controller';
import { InvoicesController } from './controllers/invoices.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { InventoryController } from './controllers/inventory.controller';

@Module({
  imports: [
    UsersModule,
    CategoriesModule,
    SuppliersModule,
    ProductsModule,
    TrucksModule,
    ImportsModule,
    InvoicesModule,
    DashboardModule,
    InventoryModule,
  ],
  controllers: [
    UsersController,
    CategoriesController,
    SuppliersController,
    ProductsController,
    TrucksController,
    ImportsController,
    InvoicesController,
    DashboardController,
    InventoryController,
  ],
})
export class AdminModule {}
