import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Invoices } from './schemas/invoices.schema';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { InvoicesService } from './invoices.service';
import { InventoryMovementsModule } from '../inventory/inventory-movements.module';
import { Customers } from '../customers/schemas/customers.schema';

@Module({
  imports: [TypegooseModule.forFeature([Invoices, Products, Trucks, Customers]), InventoryMovementsModule],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
