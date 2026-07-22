import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Invoices } from './schemas/invoices.schema';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { InvoicesService } from './invoices.service';
import { InventoryMovementsModule } from '../inventory/inventory-movements.module';
import { Customers } from '../customers/schemas/customers.schema';
import { Users } from '../users/schemas/users.schema';
import { Promotions, Vouchers } from '../promotions/schemas/promotions.schema';
import { InvoiceCounters } from './schemas/invoice-counter.schema';
import { Categories } from '../categories/schemas/categories.schema';
import { PromotionRuleEngineService } from './promotion-rule-engine.service';

@Module({
  imports: [TypegooseModule.forFeature([Invoices, Products, Trucks, Customers, Users, Promotions, Vouchers, InvoiceCounters, Categories]), InventoryMovementsModule],
  providers: [InvoicesService, PromotionRuleEngineService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
