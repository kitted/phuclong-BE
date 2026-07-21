import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Imports } from './schemas/imports.schema';
import { Products } from '../products/schemas/products.schema';
import { ImportsService } from './imports.service';
import { InventoryMovementsModule } from '../inventory/inventory-movements.module';

@Module({
  imports: [TypegooseModule.forFeature([Imports, Products]), InventoryMovementsModule],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
