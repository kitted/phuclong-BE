import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Products } from '../products/schemas/products.schema';
import { Imports } from '../imports/schemas/imports.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { DashboardService } from './dashboard.service';
import { Customers } from '../customers/schemas/customers.schema'; import { DebtPayments } from '../debt-payments/schemas/debt-payments.schema'; import { Promotions, Vouchers } from '../promotions/schemas/promotions.schema'; import { PromotionActivations } from '../promotion-activations/schemas/promotion-activations.schema'; import { Users } from '../users/schemas/users.schema'; import { EmployeeKpis } from '../employee-kpis/schemas/employee-kpis.schema'; import { TruckTransfers } from '../trucks/schemas/truck-transfers.schema'; import { AuditLogs } from '../audit-logs/schemas/audit-logs.schema';

@Module({
  imports: [TypegooseModule.forFeature([Products, Imports, Invoices, Trucks, Customers, DebtPayments, Promotions, Vouchers, PromotionActivations, Users, EmployeeKpis, TruckTransfers, AuditLogs])],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
