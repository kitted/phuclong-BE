import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Trucks } from './schemas/trucks.schema';
import { Products } from '../products/schemas/products.schema';
import { TrucksService } from './trucks.service';
import { InventoryMovementsModule } from '../inventory/inventory-movements.module';

@Module({
  imports: [TypegooseModule.forFeature([Trucks, Products]), InventoryMovementsModule],
  providers: [TrucksService],
  exports: [TrucksService],
})
export class TrucksModule {}
