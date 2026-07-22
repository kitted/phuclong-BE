import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Trucks } from './schemas/trucks.schema';
import { Products } from '../products/schemas/products.schema';
import { TrucksService } from './trucks.service';
import { InventoryMovementsModule } from '../inventory/inventory-movements.module';
import { TruckTransferCounters, TruckTransfers } from './schemas/truck-transfers.schema';
import { Users } from '../users/schemas/users.schema';

@Module({
  imports: [TypegooseModule.forFeature([Trucks, Products, TruckTransfers, TruckTransferCounters, Users]), InventoryMovementsModule],
  providers: [TrucksService],
  exports: [TrucksService],
})
export class TrucksModule {}
