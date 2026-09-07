import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import {
  WarrantyReturnCounters,
  WarrantyReturns,
} from './schemas/warranty-returns.schema';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { Users } from '../users/schemas/users.schema';
import { WebsiteProducts } from '../website-orders/schemas/website-products.schema';
import { InventoryMovements } from '../inventory/schemas/inventory-movement.schema';
import { Notifications } from '../notifications/schemas/notifications.schema';
import { WarrantyReturnsService } from './warranty-returns.service';

@Module({
  imports: [
    TypegooseModule.forFeature([
      WarrantyReturns,
      WarrantyReturnCounters,
      Products,
      Trucks,
      Users,
      WebsiteProducts,
      InventoryMovements,
      Notifications,
    ]),
  ],
  providers: [WarrantyReturnsService],
  exports: [WarrantyReturnsService],
})
export class WarrantyReturnsModule {}
