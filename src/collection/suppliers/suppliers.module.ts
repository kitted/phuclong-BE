import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Suppliers } from './schemas/suppliers.schema';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [TypegooseModule.forFeature([Suppliers])],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
