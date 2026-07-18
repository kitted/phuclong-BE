import { Injectable } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Products } from '../products/schemas/products.schema';
import { Imports } from '../imports/schemas/imports.schema';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { ReturnModelType } from '@typegoose/typegoose';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Products)
    private readonly productModel: ReturnModelType<typeof Products>,
    @InjectModel(Imports)
    private readonly importModel: ReturnModelType<typeof Imports>,
    @InjectModel(Invoices)
    private readonly invoiceModel: ReturnModelType<typeof Invoices>,
    @InjectModel(Trucks)
    private readonly truckModel: ReturnModelType<typeof Trucks>,
  ) {}

  async getStats() {
    const totalProducts = await this.productModel.countDocuments({ isDeleted: false });
    const outOfStock = await this.productModel.countDocuments({ isDeleted: false, stock: 0 });
    const lowStock = await this.productModel.countDocuments({
      isDeleted: false,
      stock: { $gt: 0 },
      $expr: { $lte: ['$stock', '$minStock'] }
    });

    const imports = await this.importModel.aggregate([
      { $match: { isDeleted: false, status: 'completed' } },
      { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
    ]);
    const totalImportValue = imports.length > 0 ? imports[0].totalAmount : 0;

    const invoices = await this.invoiceModel.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
    ]);
    const totalSaleValue = invoices.length > 0 ? invoices[0].totalAmount : 0;

    const trucks = await this.truckModel.countDocuments({ isDeleted: false, status: 'active' });

    return {
      totalProducts,
      outOfStock,
      lowStock,
      totalImportValue,
      totalSaleValue,
      activeTrucks: trucks
    };
  }
}
