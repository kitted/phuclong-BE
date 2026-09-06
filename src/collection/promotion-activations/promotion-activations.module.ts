import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import {
  PromotionActivationCounters,
  PromotionActivations,
} from './schemas/promotion-activations.schema';
import { PromotionActivationsService } from './promotion-activations.service';
import { Products } from '../products/schemas/products.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { Users } from '../users/schemas/users.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
@Module({
  imports: [
    TypegooseModule.forFeature([
      PromotionActivations,
      PromotionActivationCounters,
      Products,
      Customers,
      Users,
      Trucks,
    ]),
  ],
  providers: [PromotionActivationsService],
  exports: [PromotionActivationsService, TypegooseModule],
})
export class PromotionActivationsModule {}
