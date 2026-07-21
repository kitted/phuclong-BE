import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Invoices } from './schemas/invoices.schema';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { InvoicesService } from './invoices.service';
import { InventoryMovementsModule } from '../inventory/inventory-movements.module';

@Module({
  imports: [TypegooseModule.forFeature([Invoices, Products, Trucks]), InventoryMovementsModule],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
