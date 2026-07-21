import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Customers } from './schemas/customers.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { Vouchers } from '../promotions/schemas/promotions.schema';
import { CustomersService } from './customers.service';

@Module({
  imports: [TypegooseModule.forFeature([Customers, Invoices, Vouchers])],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
