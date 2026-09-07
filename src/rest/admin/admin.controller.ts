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
import { DebtPaymentsModule } from 'src/collection/debt-payments/debt-payments.module';
import { ReportsModule } from 'src/collection/reports/reports.module';
import { NotificationsModule } from 'src/collection/notifications/notifications.module';
import { CustomerReturnsModule } from 'src/collection/customer-returns/customer-returns.module';
import { GoodsAdvancesModule } from 'src/collection/goods-advances/goods-advances.module';
import { DailyReportsModule } from 'src/collection/daily-reports/daily-reports.module';
import { QuickNotesModule } from 'src/collection/quick-notes/quick-notes.module';
import { WebsiteOrdersModule } from 'src/collection/website-orders/website-orders.module';
import { WebsiteContentsModule } from 'src/collection/website-contents/website-contents.module';

import { UsersController } from './controllers/users';
import { CategoriesController } from './controllers/categories.controller';
import { SuppliersController } from './controllers/suppliers.controller';
import { ProductsController } from './controllers/products.controller';
import {
  TrucksController,
  TruckStockChecksController,
  TruckInventoryBackupsController,
} from './controllers/trucks.controller';
import { ImportsController } from './controllers/imports.controller';
import { InvoicesController } from './controllers/invoices.controller';
import { DashboardController } from './controllers/dashboard.controller';
import {
  InventoryController,
  InventoryStockChecksController,
  InventoryBackupsController,
} from './controllers/inventory.controller';
import { CustomersController } from './controllers/customers.controller';
import { PromotionsController } from './controllers/promotions.controller';
import { TruckTransfersController } from './controllers/truck-transfers.controller';
import { PromotionActivationsController } from './controllers/promotion-activations.controller';
import { EmployeeKpisController } from './controllers/employee-kpis.controller';
import { DebtPaymentsController } from './controllers/debt-payments.controller';
import { AuditLogsController } from './controllers/audit-logs.controller';
import { ReportsController } from './controllers/reports.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { BackupsController } from './controllers/backups.controller';
import {
  CustomerReturnsController,
  TruckUnclassifiedReturnStockController,
  UnclassifiedReturnStockController,
} from './controllers/customer-returns.controller';
import { GoodsAdvancesController } from './controllers/goods-advances.controller';
import { DailyReportsController } from './controllers/daily-reports.controller';
import { QuickNotesController } from './controllers/quick-notes.controller';
import { WebsiteOrdersController } from './controllers/website-orders.controller';
import { WebsiteContentsController } from './controllers/website-contents.controller';
import { WebsiteContentCategoriesController } from './controllers/website-content-categories.controller';
import { WebsiteSettingsController } from './controllers/website-settings.controller';
import { WebsiteDataController } from './controllers/website-data.controller';
import { WebsiteProductsController } from './controllers/website-products.controller';
import { LeadsModule } from 'src/collection/leads/leads.module';
import { LeadsController } from './controllers/leads.controller';
import { CustomerCoinsModule } from 'src/collection/customer-coins/customer-coins.module';
import { CustomerCoinsController } from './controllers/customer-coins.controller';
import { DocumentSafetyModule } from 'src/collection/document-safety/document-safety.module';
import { DocumentSafetyController } from './controllers/document-safety.controller';
import { WarrantyReturnsModule } from 'src/collection/warranty-returns/warranty-returns.module';
import { WarrantyReturnsController } from './controllers/warranty-returns.controller';

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
    DebtPaymentsModule,
    ReportsModule,
    NotificationsModule,
    CustomerReturnsModule,
    GoodsAdvancesModule,
    DailyReportsModule,
    QuickNotesModule,
    WebsiteOrdersModule,
    WebsiteContentsModule,
    LeadsModule,
    CustomerCoinsModule,
    DocumentSafetyModule,
    WarrantyReturnsModule,
  ],
  controllers: [
    UsersController,
    CategoriesController,
    SuppliersController,
    ProductsController,
    TrucksController,
    TruckStockChecksController,
    TruckInventoryBackupsController,
    ImportsController,
    InvoicesController,
    DashboardController,
    InventoryController,
    InventoryStockChecksController,
    InventoryBackupsController,
    CustomersController,
    PromotionsController,
    TruckTransfersController,
    PromotionActivationsController,
    EmployeeKpisController,
    DebtPaymentsController,
    AuditLogsController,
    ReportsController,
    NotificationsController,
    BackupsController,
    CustomerReturnsController,
    TruckUnclassifiedReturnStockController,
    UnclassifiedReturnStockController,
    GoodsAdvancesController,
    DailyReportsController,
    QuickNotesController,
    WebsiteOrdersController,
    WebsiteContentsController,
    WebsiteContentCategoriesController,
    WebsiteSettingsController,
    WebsiteDataController,
    WebsiteProductsController,
    LeadsController,
    CustomerCoinsController,
    DocumentSafetyController,
    WarrantyReturnsController,
  ],
})
export class AdminModule {}
