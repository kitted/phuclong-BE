import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { InventoryMovements } from './schemas/inventory-movement.schema';
import { InventoryMovementsService } from './inventory-movements.service';

@Module({
  imports: [TypegooseModule.forFeature([InventoryMovements])],
  providers: [InventoryMovementsService],
  exports: [InventoryMovementsService, TypegooseModule],
})
export class InventoryMovementsModule {}
