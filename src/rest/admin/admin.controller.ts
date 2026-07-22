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
import { CustomersModule } from 'src/collection/customers/customers.module';
import { PromotionsModule } from 'src/collection/promotions/promotions.module';
import { PromotionActivationsModule } from 'src/collection/promotion-activations/promotion-activations.module';
import { EmployeeKpisModule } from 'src/collection/employee-kpis/employee-kpis.module';

import { UsersController } from './controllers/users';
import { CategoriesController } from './controllers/categories.controller';
import { SuppliersController } from './controllers/suppliers.controller';
import { ProductsController } from './controllers/products.controller';
import { TrucksController } from './controllers/trucks.controller';
import { ImportsController } from './controllers/imports.controller';
import { InvoicesController } from './controllers/invoices.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { InventoryController } from './controllers/inventory.controller';
import { CustomersController } from './controllers/customers.controller';
import { PromotionsController } from './controllers/promotions.controller';
import { TruckTransfersController } from './controllers/truck-transfers.controller';
import { PromotionActivationsController } from './controllers/promotion-activations.controller';
import { EmployeeKpisController } from './controllers/employee-kpis.controller';

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
    CustomersModule,
    PromotionsModule,
    PromotionActivationsModule,
    EmployeeKpisModule,
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
    CustomersController,
    PromotionsController,
    TruckTransfersController,
    PromotionActivationsController,
    EmployeeKpisController,
  ],
})
export class AdminModule {}
