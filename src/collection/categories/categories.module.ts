import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Categories } from './schemas/categories.schema';
import { CategoriesService } from './categories.service';

@Module({
  imports: [TypegooseModule.forFeature([Categories])],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
