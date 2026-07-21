import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Products } from './schemas/products.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import { CreateProductDto, UpdateProductDto } from './dtos/products.dto';
import { ID } from 'src/core/interfaces/id.interface';
import { Categories } from '../categories/schemas/categories.schema';
import * as ExcelJS from 'exceljs';
import { excelNumber, excelValue, normalizeExcelRow } from '../../core/excel-import';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Products)
    private readonly model: ReturnModelType<typeof Products>,
    @InjectModel(Categories)
    private readonly categoryModel: ReturnModelType<typeof Categories>,
  ) {}

  async create(dto: CreateProductDto) {
    const existing = await this.model.findOne({ code: dto.code, isDeleted: false });
    if (existing) throw new BadRequestException('Mã sản phẩm đã tồn tại');
    return await this.model.create(dto);
  }

  async findAll() {
    return await this.model.find({ isDeleted: false })
      .populate('categoryId', 'name')
      .populate('supplierId', 'name');
  }

  async findOne(id: ID | string) {
    const doc = await this.model.findOne({ _id: id, isDeleted: false })
      .populate('categoryId', 'name')
      .populate('supplierId', 'name');
    if (!doc) throw new NotFoundException('Không tìm thấy sản phẩm');
    return doc;
  }

  async update(id: ID | string, dto: UpdateProductDto) {
    if (dto.code) {
      const existing = await this.model.findOne({ code: dto.code, _id: { $ne: id }, isDeleted: false });
      if (existing) throw new BadRequestException('Mã sản phẩm đã tồn tại');
    }
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      dto,
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy sản phẩm');
    return doc;
  }

  async remove(id: ID | string) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy sản phẩm');
    return doc;
  }

  async importRows(rows: Record<string, unknown>[]): Promise<any> {
    if (!Array.isArray(rows) || !rows.length) throw new BadRequestException('File import không có dữ liệu');
    if (rows.length > 10000) throw new BadRequestException('Mỗi lần chỉ được import tối đa 10.000 dòng');
    let created = 0; let updated = 0; let categoriesCreated = 0;
    const errors: Array<{ row: number; message: string; data: Record<string, unknown> }> = [];
    const categoryCache = new Map<string, string>();
    const categories = await this.categoryModel.find({ isDeleted: false }).select('_id name').lean();
    categories.forEach((category: any) => categoryCache.set(category.name.trim().toLocaleLowerCase('vi'), String(category._id)));

    for (let index = 0; index < rows.length; index++) {
      const original = rows[index];
      try {
        const row = normalizeExcelRow(original);
        const code = String(excelValue(row, ['Mã sản phẩm', 'Mã SP', 'code'])).trim().toUpperCase();
        const name = String(excelValue(row, ['Tên sản phẩm', 'Tên', 'name'])).trim();
        if (!code || !name) throw new Error('Thiếu mã hoặc tên sản phẩm');
        const categoryName = String(excelValue(row, ['Danh mục', 'category'])).trim();
        let categoryId: string | null | undefined;
        if (categoryName) {
          const key = categoryName.toLocaleLowerCase('vi');
          categoryId = categoryCache.get(key);
          if (!categoryId) {
            try {
              const category = await this.categoryModel.create({ name: categoryName });
              categoryId = String(category._id); categoryCache.set(key, categoryId); categoriesCreated++;
            } catch {
              categoryId = null;
            }
          }
        }
        const payload: any = {
          code, name,
          unit: String(excelValue(row, ['Đơn vị', 'ĐVT', 'unit'])).trim() || undefined,
          costPrice: Math.max(0, excelNumber(excelValue(row, ['Giá nhập', 'costPrice']))),
          sellPrice: Math.max(0, excelNumber(excelValue(row, ['Giá bán', 'sellPrice']))),
          minStock: Math.max(0, excelNumber(excelValue(row, ['Tồn tối thiểu', 'Tồn min', 'minStock']))),
          stock: Math.max(0, excelNumber(excelValue(row, ['Tồn kho', 'stock']))),
        };
        if (categoryId !== undefined) payload.categoryId = categoryId;
        const existing = await this.model.findOne({ code, isDeleted: false }).select('_id').lean();
        if (existing) {
          await this.model.updateOne({ _id: existing._id }, { $set: payload }); updated++;
        } else {
          await this.model.create(payload); created++;
        }
      } catch (error) {
        errors.push({ row: index + 2, message: error instanceof Error ? error.message : 'Không thể lưu sản phẩm', data: original });
      }
    }
    return { data: { totalRows: rows.length, created, updated, categoriesCreated, failed: errors.length, errors } };
  }

  async exportExcel(): Promise<Buffer> {
    const products = await this.model.find({ isDeleted: false }).populate('categoryId', 'name').sort({ createdAt: -1 }).lean();
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('San pham');
    sheet.columns = [
      { header: 'Mã sản phẩm', key: 'code', width: 18 }, { header: 'Tên sản phẩm', key: 'name', width: 32 },
      { header: 'Danh mục', key: 'category', width: 24 }, { header: 'Đơn vị', key: 'unit', width: 12 },
      { header: 'Giá nhập', key: 'costPrice', width: 16 }, { header: 'Giá bán', key: 'sellPrice', width: 16 },
      { header: 'Tồn tối thiểu', key: 'minStock', width: 18 }, { header: 'Tồn kho', key: 'stock', width: 16 },
    ];
    products.forEach((item: any) => sheet.addRow({ ...item, category: item.categoryId?.name || '' }));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }]; sheet.autoFilter = { from: 'A1', to: 'H1' };
    ['costPrice', 'sellPrice', 'minStock', 'stock'].forEach((column) => { sheet.getColumn(column).numFmt = '#,##0'; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
