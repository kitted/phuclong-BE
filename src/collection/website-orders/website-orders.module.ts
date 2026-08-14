import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Products } from '../products/schemas/products.schema';
import { Categories } from '../categories/schemas/categories.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { Users } from '../users/schemas/users.schema';
import { WebsiteOrderCounters, WebsiteOrders } from './schemas/website-orders.schema';
import { WebsiteOrdersService } from './website-orders.service';
import { InvoicesModule } from '../invoices/invoices.module';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { WebsiteProductCategories, WebsiteProducts } from './schemas/website-products.schema';

@Module({
  imports: [
    TypegooseModule.forFeature([WebsiteOrders, WebsiteOrderCounters, Products, Categories, Customers, Users, Invoices, WebsiteProducts, WebsiteProductCategories]),
    InvoicesModule,
  ],
  providers: [WebsiteOrdersService],
  exports: [WebsiteOrdersService],
})
export class WebsiteOrdersModule {}
