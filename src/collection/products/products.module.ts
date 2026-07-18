import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Products } from './schemas/products.schema';
import { ProductsService } from './products.service';

@Module({
  imports: [TypegooseModule.forFeature([Products])],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
