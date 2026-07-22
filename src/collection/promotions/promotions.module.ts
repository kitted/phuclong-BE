import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Promotions, Vouchers } from './schemas/promotions.schema';
import { Products } from '../products/schemas/products.schema';
import { Categories } from '../categories/schemas/categories.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { PromotionsService } from './promotions.service';
import { Invoices } from '../invoices/schemas/invoices.schema';

@Module({
  imports: [TypegooseModule.forFeature([Promotions, Vouchers, Products, Categories, Customers, Invoices])],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
