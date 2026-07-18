import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Imports } from './schemas/imports.schema';
import { Products } from '../products/schemas/products.schema';
import { ImportsService } from './imports.service';

@Module({
  imports: [TypegooseModule.forFeature([Imports, Products])],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
