import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Products } from './schemas/products.schema';
import { ProductsService } from './products.service';
import { Categories } from '../categories/schemas/categories.schema';
import { WebsiteProducts } from '../website-orders/schemas/website-products.schema';

@Module({
  imports: [TypegooseModule.forFeature([Products, Categories, WebsiteProducts])],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
