import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { InventoryMovements } from './schemas/inventory-movement.schema';
import {
  InventoryExportQueryDto,
  InventoryListQueryDto,
  InventoryMovementsQueryDto,
  InventorySortBy,
  InventorySummaryQueryDto,
} from './dtos/inventory.dto';
import { InventoryStatus, resolveInventoryStatus } from './inventory-status';

type InventoryRow = {
  productId: string;
  productCode: string;
  productName: string;
  category: { id: string; name: string } | null;
  unit: string;
  warehouseQuantity: number;
  truckQuantity: number;
  totalQuantity: number;
  minStock: number;
  costPrice: number;
  warehouseStockValue: number;
  status: InventoryStatus;
  stockRatio: number;
  updatedAt: Date;
};

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(Products)
    private readonly productModel: ReturnModelType<typeof Products>,
    @InjectModel(Trucks)
    private readonly truckModel: ReturnModelType<typeof Trucks>,
    @InjectModel(InventoryMovements)
    private readonly movementModel: ReturnModelType<typeof InventoryMovements>,
  ) {}

  private positiveInt(value: string | undefined, fallback: number, maximum?: number) {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed < 1 || (maximum && parsed > maximum)) {
      throw new BadRequestException(`Giá trị phải là số nguyên từ 1${maximum ? ` đến ${maximum}` : ''}`);
    }
    return parsed;
  }

  private async rows(categoryId?: string): Promise<InventoryRow[]> {
    const productFilter: Record<string, unknown> = { isDeleted: false };
    if (categoryId) {
      if (!Types.ObjectId.isValid(categoryId)) throw new BadRequestException('categoryId không hợp lệ');
      productFilter.categoryId = categoryId;
    }

    const [products, truckTotals] = await Promise.all([
      this.productModel.find(productFilter).populate('categoryId', 'name').lean(),
      this.truckModel.aggregate([
        { $match: { isDeleted: false } },
        { $unwind: '$inventory' },
        { $group: { _id: '$inventory.productId', quantity: { $sum: '$inventory.qty' } } },
      ]),
    ]);
    const totals = new Map(truckTotals.map((item) => [String(item._id), Number(item.quantity) || 0]));

    return products.map((product: any) => {
      const warehouseQuantity = Number(product.stock) || 0;
      const truckQuantity = totals.get(String(product._id)) || 0;
      const minStock = Number(product.minStock) || 0;
      const costPrice = Number(product.costPrice) || 0;
      const category = product.categoryId
        ? { id: String(product.categoryId._id), name: product.categoryId.name }
        : null;
      return {
        productId: String(product._id),
        productCode: product.code,
        productName: product.name,
        category,
        unit: product.unit || '',
        warehouseQuantity,
        truckQuantity,
        totalQuantity: warehouseQuantity + truckQuantity,
        minStock,
        costPrice,
        warehouseStockValue: warehouseQuantity * costPrice,
        status: resolveInventoryStatus(warehouseQuantity, minStock),
        stockRatio: minStock > 0 ? Math.round((warehouseQuantity / minStock) * 10000) / 100 : 100,
        updatedAt: product.updatedAt,
      };
    });
  }

  private filterAndSort(rows: InventoryRow[], query: InventoryListQueryDto) {
    const search = query.search?.trim().toLocaleLowerCase('vi');
    const status = query.status || InventoryStatus.ALL;
    const filtered = rows.filter((row) => {
      const matchesSearch = !search || row.productCode.toLocaleLowerCase('vi').includes(search)
        || row.productName.toLocaleLowerCase('vi').includes(search);
      return matchesSearch && (status === InventoryStatus.ALL || row.status === status);
    });
    const sortBy = query.sortBy || InventorySortBy.PRODUCT_CODE;
    const direction = query.sortOrder === 'desc' ? -1 : 1;
    filtered.sort((left, right) => {
      const a = left[sortBy as keyof InventoryRow] as any;
      const b = right[sortBy as keyof InventoryRow] as any;
      if (typeof a === 'string') return a.localeCompare(b, 'vi', { numeric: true }) * direction;
      if (a instanceof Date) return (a.getTime() - b.getTime()) * direction;
      return ((a || 0) - (b || 0)) * direction;
    });
    return filtered;
  }

  async getList(query: InventoryListQueryDto) {
    const page = this.positiveInt(query.page, 1);
    const limit = this.positiveInt(query.limit, 20, 100);
    const rows = this.filterAndSort(await this.rows(query.categoryId), query);
    const totalItems = rows.length;
    return {
      data: rows.slice((page - 1) * limit, page * limit),
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async getSummary(query: InventorySummaryQueryDto) {
    const rows = await this.rows(query.categoryId);
    const statusCounts = { inStock: 0, lowStock: 0, outOfStock: 0 };
    for (const row of rows) {
      if (row.status === InventoryStatus.IN_STOCK) statusCounts.inStock++;
      else if (row.status === InventoryStatus.LOW_STOCK) statusCounts.lowStock++;
      else statusCounts.outOfStock++;
    }
    return {
      data: {
        totalProducts: rows.length,
        totalWarehouseQuantity: rows.reduce((sum, row) => sum + row.warehouseQuantity, 0),
        totalTruckQuantity: rows.reduce((sum, row) => sum + row.truckQuantity, 0),
        warehouseStockValue: rows.reduce((sum, row) => sum + row.warehouseStockValue, 0),
        statusCounts,
        calculatedAt: new Date(),
      },
    };
  }

  async getProductDetail(productId: string) {
    const product = await this.productModel.findOne({ _id: productId, isDeleted: false }).lean();
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    const trucks = await this.truckModel.find({
      isDeleted: false,
      inventory: { $elemMatch: { productId } },
    }).select('code name inventory').lean();
    const truckBreakdown = trucks.map((truck: any) => ({
      truckId: String(truck._id),
      truckCode: truck.code,
      truckName: truck.name,
      quantity: Number(truck.inventory.find((item) => String(item.productId) === productId)?.qty) || 0,
    })).filter((item) => item.quantity !== 0);
    const warehouseQuantity = Number(product.stock) || 0;
    const truckQuantity = truckBreakdown.reduce((sum, item) => sum + item.quantity, 0);
    return {
      data: {
        product: { id: String(product._id), code: product.code, name: product.name, unit: product.unit || '', minStock: product.minStock || 0 },
        warehouseQuantity,
        truckQuantity,
        totalQuantity: warehouseQuantity + truckQuantity,
        truckBreakdown,
      },
    };
  }

  async getProductMovements(productId: string, query: InventoryMovementsQueryDto) {
    const exists = await this.productModel.exists({ _id: productId, isDeleted: false });
    if (!exists) throw new NotFoundException('Không tìm thấy sản phẩm');
    const page = this.positiveInt(query.page, 1);
    const limit = this.positiveInt(query.limit, 20, 100);
    const filter: any = { productId, isDeleted: false };
    if (query.type) filter.type = query.type;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = this.parseDate(query.from, 'from');
      if (query.to) {
        const to = this.parseDate(query.to, 'to');
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }
    const [movements, totalItems] = await Promise.all([
      this.movementModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('sourceTruckId', 'code name').populate('destinationTruckId', 'code name').lean(),
      this.movementModel.countDocuments(filter),
    ]);
    const data = movements.map((movement: any) => ({
      id: String(movement._id), type: movement.type, quantityChange: movement.quantityChange,
      quantityBefore: movement.quantityBefore, quantityAfter: movement.quantityAfter,
      sourceLocation: this.location(movement.sourceType, movement.sourceTruckId),
      destinationLocation: this.location(movement.destinationType, movement.destinationTruckId),
      reference: movement.referenceType ? { type: movement.referenceType, id: movement.referenceId, code: movement.referenceCode } : null,
      createdAt: movement.createdAt,
      createdBy: movement.createdBy ? { id: movement.createdBy, name: movement.createdBy } : null,
    }));
    return { data, meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } };
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} không phải ngày hợp lệ`);
    return date;
  }

  private location(type?: string, truck?: any) {
    if (!type) return null;
    if (type === 'WAREHOUSE') return { type, id: 'warehouse' };
    return { type, id: truck ? String(truck._id) : null, code: truck?.code, name: truck?.name };
  }

  async export(query: InventoryExportQueryDto) {
    const rows = this.filterAndSort(await this.rows(query.categoryId), query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tồn kho');
    sheet.columns = [
      { header: 'Mã sản phẩm', key: 'productCode', width: 18 },
      { header: 'Tên sản phẩm', key: 'productName', width: 32 },
      { header: 'Danh mục', key: 'category', width: 24 },
      { header: 'Đơn vị', key: 'unit', width: 12 },
      { header: 'Tồn kho', key: 'warehouseQuantity', width: 14 },
      { header: 'Trên xe', key: 'truckQuantity', width: 14 },
      { header: 'Tổng', key: 'totalQuantity', width: 14 },
      { header: 'Tồn tối thiểu', key: 'minStock', width: 16 },
      { header: 'Giá vốn', key: 'costPrice', width: 16 },
      { header: 'Giá trị tồn kho', key: 'warehouseStockValue', width: 20 },
      { header: 'Trạng thái', key: 'status', width: 18 },
      { header: 'Cập nhật', key: 'updatedAt', width: 22 },
    ];
    rows.forEach((row) => sheet.addRow({ ...row, category: row.category?.name || '' }));
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: 'A1', to: 'L1' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getColumn('costPrice').numFmt = '#,##0';
    sheet.getColumn('warehouseStockValue').numFmt = '#,##0';
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
