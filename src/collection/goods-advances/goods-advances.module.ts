import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import {
  GoodsAdvanceCounters,
  GoodsAdvances,
} from './schemas/goods-advances.schema';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { Users } from '../users/schemas/users.schema';
import { InventoryMovements } from '../inventory/schemas/inventory-movement.schema';
import { Notifications } from '../notifications/schemas/notifications.schema';
import { GoodsAdvancesService } from './goods-advances.service';
@Module({
  imports: [
    TypegooseModule.forFeature([
      GoodsAdvances,
      GoodsAdvanceCounters,
      Products,
      Trucks,
      Users,
      InventoryMovements,
      Notifications,
    ]),
  ],
  providers: [GoodsAdvancesService],
  exports: [GoodsAdvancesService],
})
export class GoodsAdvancesModule {}
