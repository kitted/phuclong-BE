import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Products } from './schemas/products.schema';
import { ProductsService } from './products.service';
import { Categories } from '../categories/schemas/categories.schema';

@Module({
  imports: [TypegooseModule.forFeature([Products, Categories])],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
