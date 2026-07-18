import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Trucks } from './schemas/trucks.schema';
import { Products } from '../products/schemas/products.schema';
import { TrucksService } from './trucks.service';

@Module({
  imports: [TypegooseModule.forFeature([Trucks, Products])],
  providers: [TrucksService],
  exports: [TrucksService],
})
export class TrucksModule {}
