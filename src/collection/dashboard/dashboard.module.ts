import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Products } from '../products/schemas/products.schema';
import { Imports } from '../imports/schemas/imports.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypegooseModule.forFeature([Products, Imports, Invoices, Trucks])],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
