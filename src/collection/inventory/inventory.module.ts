import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { InventoryMovements } from './schemas/inventory-movement.schema';
import { InventoryService } from './inventory.service';

@Module({
  imports: [TypegooseModule.forFeature([Products, Trucks, InventoryMovements])],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
