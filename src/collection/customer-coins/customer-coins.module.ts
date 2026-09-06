import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Customers } from '../customers/schemas/customers.schema';
import { Products } from '../products/schemas/products.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { WebsiteProducts } from '../website-orders/schemas/website-products.schema';
import {
  CustomerCoinCounters,
  CustomerCoinLedgers,
} from './schemas/customer-coins.schema';
import { CustomerCoinsService } from './customer-coins.service';

@Module({
  imports: [
    TypegooseModule.forFeature([
      CustomerCoinLedgers,
      CustomerCoinCounters,
      Customers,
      Products,
      Invoices,
      WebsiteProducts,
    ]),
  ],
  providers: [CustomerCoinsService],
  exports: [CustomerCoinsService],
})
export class CustomerCoinsModule {}
