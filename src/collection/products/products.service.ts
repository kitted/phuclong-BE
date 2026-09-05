import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Products } from './schemas/products.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import {
  CreateProductDto,
  ProductListQueryDto,
  UpdateProductDto,
} from './dtos/products.dto';
import { ID } from 'src/core/interfaces/id.interface';
import { Categories } from '../categories/schemas/categories.schema';
import * as ExcelJS from 'exceljs';
import { excelValue, normalizeExcelRow } from '../../core/excel-import';

export function normalizeProductCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

const PRODUCT_IMPORT_ALIASES = {
  code: ['Mã sản phẩm', 'Mã SP', 'code'],
  name: ['Tên sản phẩm', 'Tên', 'name'],
  barcode: ['Mã vạch', 'barcode'],
  category: ['Danh mục', 'category'],
  unit: ['Đơn vị', 'ĐVT', 'unit'],
  costPrice: ['Giá nhập', 'costPrice'],
  sellPrice: ['Giá bán', 'sellPrice'],
  minStock: ['Tồn tối thiểu', 'Tồn min', 'minStock'],
  legacyStock: [
    'Tồn kho hiện tại (CHỈ XEM)',
    'Tồn kho hiện tại',
    'Tồn kho',
    'stock',
  ],
};

function optionalText(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function optionalNonNegativeNumber(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '')
    return undefined;
  const normalized =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/\s/g, '').replace(/,/g, ''));
  if (!Number.isFinite(normalized) || normalized < 0)
    throw new Error(`${label} phải là số lớn hơn hoặc bằng 0`);
  return normalized;
}

export function parseProductImportRow(original: Record<string, unknown>) {
  const row = normalizeExcelRow(original);
  const code = normalizeProductCode(
    excelValue(row, PRODUCT_IMPORT_ALIASES.code),
  );
  const name = optionalText(excelValue(row, PRODUCT_IMPORT_ALIASES.name));
  if (!code) throw new Error('Thiếu mã sản phẩm');
  if (!name) throw new Error('Thiếu tên sản phẩm');
  const minStock = optionalNonNegativeNumber(
    excelValue(row, PRODUCT_IMPORT_ALIASES.minStock, null),
    'Tồn tối thiểu',
  );
  if (minStock !== undefined && !Number.isInteger(minStock))
    throw new Error('Tồn tối thiểu phải là số nguyên');
  const legacyStock = excelValue(row, PRODUCT_IMPORT_ALIASES.legacyStock, null);
  return {
    code,
    name,
    barcode: optionalText(excelValue(row, PRODUCT_IMPORT_ALIASES.barcode)),
    categoryName: optionalText(
      excelValue(row, PRODUCT_IMPORT_ALIASES.category),
    ),
    unit: optionalText(excelValue(row, PRODUCT_IMPORT_ALIASES.unit)),
    costPrice: optionalNonNegativeNumber(
      excelValue(row, PRODUCT_IMPORT_ALIASES.costPrice, null),
      'Giá nhập',
    ),
    sellPrice: optionalNonNegativeNumber(
      excelValue(row, PRODUCT_IMPORT_ALIASES.sellPrice, null),
      'Giá bán',
    ),
    minStock,
    stockWasProvided: legacyStock !== null && String(legacyStock).trim() !== '',
  };
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Products)
    private readonly model: ReturnModelType<typeof Products>,
    @InjectModel(Categories)
    private readonly categoryModel: ReturnModelType<typeof Categories>,
  ) {}

  async create(dto: CreateProductDto) {
    const code = normalizeProductCode(dto.code);
    const existing = await this.model.findOne({ code, isDeleted: false });
    if (existing) throw new BadRequestException('Mã sản phẩm đã tồn tại');
    return await this.model.create({ ...dto, code, name: dto.name.trim() });
  }

  async findAll(query: ProductListQueryDto = {}): Promise<any> {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new BadRequestException('Tham số phân trang không hợp lệ');
    const filter: any = { isDeleted: false };
    if (query.search?.trim()) {
      const escaped = query.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['code', 'name', 'barcode'].map((field) => ({
        [field]: { $regex: escaped, $options: 'i' },
      }));
    }
    const [products, totalItems] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('categoryId', 'name')
        .populate('supplierId', 'name')
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: products.map((product: any) => ({
        ...product,
        id: String(product._id),
        category: product.categoryId
          ? {
              id: String(product.categoryId._id),
              name: product.categoryId.name,
            }
          : null,
      })),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async findOne(id: ID | string) {
    const doc = await this.model
      .findOne({ _id: id, isDeleted: false })
      .populate('categoryId', 'name')
      .populate('supplierId', 'name');
    if (!doc) throw new NotFoundException('Không tìm thấy sản phẩm');
    return doc;
  }

  async update(id: ID | string, dto: UpdateProductDto) {
    const payload: any = { ...dto };
    if (dto.code) {
      payload.code = normalizeProductCode(dto.code);
      const existing = await this.model.findOne({
        code: payload.code,
        _id: { $ne: id },
        isDeleted: false,
      });
      if (existing) throw new BadRequestException('Mã sản phẩm đã tồn tại');
    }
    if (dto.name !== undefined) payload.name = dto.name.trim();
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      payload,
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
    if (!Array.isArray(rows) || !rows.length)
      throw new BadRequestException('File import không có dữ liệu');
    if (rows.length > 10000)
      throw new BadRequestException(
        'Mỗi lần chỉ được import tối đa 10.000 dòng',
      );
    let created = 0;
    let updated = 0;
    let categoriesCreated = 0;
    let stockIgnoredRows = 0;
    const errors: Array<{
      row: number;
      message: string;
      data: Record<string, unknown>;
    }> = [];
    const parsedRows = rows.map((original, index) => {
      try {
        return { index, original, value: parseProductImportRow(original) };
      } catch (error) {
        errors.push({
          row: index + 2,
          message:
            error instanceof Error ? error.message : 'Dữ liệu không hợp lệ',
          data: original,
        });
        return null;
      }
    });
    const codeCounts = new Map<string, number>();
    const barcodeCounts = new Map<string, number>();
    parsedRows.forEach((item) => {
      if (item) {
        codeCounts.set(
          item.value.code,
          (codeCounts.get(item.value.code) || 0) + 1,
        );
        if (item.value.barcode)
          barcodeCounts.set(
            item.value.barcode,
            (barcodeCounts.get(item.value.barcode) || 0) + 1,
          );
      }
    });
    const categoryCache = new Map<string, string>();
    const categories = await this.categoryModel
      .find({ isDeleted: false })
      .select('_id name')
      .lean();
    categories.forEach((category: any) =>
      categoryCache.set(
        category.name.trim().toLocaleLowerCase('vi'),
        String(category._id),
      ),
    );

    for (const parsed of parsedRows) {
      if (!parsed) continue;
      const { index, original, value } = parsed;
      try {
        if ((codeCounts.get(value.code) || 0) > 1)
          throw new Error(
            `Mã sản phẩm ${value.code} bị trùng nhiều dòng trong file`,
          );
        if (value.barcode && (barcodeCounts.get(value.barcode) || 0) > 1)
          throw new Error(
            `Mã vạch ${value.barcode} bị trùng nhiều dòng trong file`,
          );
        let categoryId: string | undefined;
        if (value.categoryName) {
          const key = value.categoryName.toLocaleLowerCase('vi');
          categoryId = categoryCache.get(key);
          if (!categoryId) {
            const category = await this.categoryModel.create({
              name: value.categoryName,
            });
            categoryId = String(category._id);
            categoryCache.set(key, categoryId);
            categoriesCreated++;
          }
        }
        const payload: any = { code: value.code, name: value.name };
        for (const key of [
          'barcode',
          'unit',
          'costPrice',
          'sellPrice',
          'minStock',
        ] as const)
          if (value[key] !== undefined) payload[key] = value[key];
        if (categoryId !== undefined) payload.categoryId = categoryId;
        if (value.stockWasProvided) stockIgnoredRows++;
        // Tìm cả bản ghi soft-delete vì `code` là unique trên toàn collection.
        const existing = await this.model
          .findOne({ code: value.code })
          .select('_id isDeleted')
          .lean();
        if (value.barcode) {
          const barcodeOwner = await this.model.exists({
            barcode: value.barcode,
            ...(existing ? { _id: { $ne: existing._id } } : {}),
          });
          if (barcodeOwner)
            throw new Error(`Mã vạch ${value.barcode} đã thuộc sản phẩm khác`);
        }
        if (existing) {
          await this.model.updateOne(
            { _id: existing._id },
            {
              $set: {
                ...payload,
                isDeleted: false,
                deletedAt: null,
                deletedBy: null,
              },
            },
          );
          updated++;
        } else {
          try {
            await this.model.create({ ...payload, stock: 0 });
            created++;
          } catch (error: any) {
            // Hai batch có thể đồng thời không thấy mã rồi cùng create. Unique index
            // quyết định winner; request còn lại chuyển sang update thay vì báo lỗi.
            if (error?.code !== 11000) throw error;
            const raced = await this.model
              .findOne({ code: value.code })
              .select('_id')
              .lean();
            if (!raced) throw error;
            await this.model.updateOne(
              { _id: raced._id },
              {
                $set: {
                  ...payload,
                  isDeleted: false,
                  deletedAt: null,
                  deletedBy: null,
                },
              },
            );
            updated++;
          }
        }
      } catch (error) {
        const message =
          (error as any)?.code === 11000 && (error as any)?.keyPattern?.barcode
            ? `Mã vạch đã thuộc sản phẩm khác`
            : error instanceof Error
              ? error.message
              : 'Không thể lưu sản phẩm';
        errors.push({ row: index + 2, message, data: original });
      }
    }
    return {
      data: {
        totalRows: rows.length,
        created,
        updated,
        categoriesCreated,
        failed: errors.length,
        stockIgnoredRows,
        warnings: stockIgnoredRows
          ? [
              `Đã bỏ qua cột tồn kho ở ${stockIgnoredRows} dòng; tồn kho chỉ thay đổi qua nghiệp vụ kho hoặc kiểm kho.`,
            ]
          : [],
        errors,
      },
    };
  }

  async previewImportRows(rows: Record<string, unknown>[]): Promise<any> {
    if (!Array.isArray(rows) || !rows.length)
      throw new BadRequestException('File import không có dữ liệu');
    if (rows.length > 10000)
      throw new BadRequestException(
        'Mỗi lần chỉ được import tối đa 10.000 dòng',
      );
    const parsed = rows.map((original, index) => {
      try {
        return { index, original, value: parseProductImportRow(original) };
      } catch (error) {
        return {
          index,
          original,
          error:
            error instanceof Error ? error.message : 'Dữ liệu không hợp lệ',
        };
      }
    });
    const counts = new Map<string, number>();
    const barcodeCounts = new Map<string, number>();
    parsed.forEach((item: any) => {
      if (item.value) {
        counts.set(item.value.code, (counts.get(item.value.code) || 0) + 1);
        if (item.value.barcode)
          barcodeCounts.set(
            item.value.barcode,
            (barcodeCounts.get(item.value.barcode) || 0) + 1,
          );
      }
    });
    const codes = parsed
      .filter((item: any) => item.value)
      .map((item: any) => item.value.code);
    const barcodes = parsed
      .filter((item: any) => item.value?.barcode)
      .map((item: any) => item.value.barcode);
    const existing =
      codes.length || barcodes.length
        ? await this.model
            .find({
              $or: [
                ...(codes.length ? [{ code: { $in: codes } }] : []),
                ...(barcodes.length ? [{ barcode: { $in: barcodes } }] : []),
              ],
            })
            .select('_id code barcode isDeleted')
            .lean()
        : [];
    const existingByCode = new Map(
      existing.map((item: any) => [item.code, item]),
    );
    const existingByBarcode = new Map(
      existing
        .filter((item: any) => item.barcode)
        .map((item: any) => [item.barcode, item]),
    );
    const items = parsed.map((item: any) => {
      const duplicate = item.value && (counts.get(item.value.code) || 0) > 1;
      const duplicateBarcode =
        item.value?.barcode && (barcodeCounts.get(item.value.barcode) || 0) > 1;
      const current: any = item.value
        ? existingByCode.get(item.value.code)
        : undefined;
      const barcodeOwner: any = item.value?.barcode
        ? existingByBarcode.get(item.value.barcode)
        : undefined;
      const barcodeConflict =
        barcodeOwner && String(barcodeOwner._id) !== String(current?._id || '');
      const error =
        item.error ||
        (duplicate
          ? `Mã sản phẩm ${item.value.code} bị trùng nhiều dòng trong file`
          : duplicateBarcode
            ? `Mã vạch ${item.value.barcode} bị trùng nhiều dòng trong file`
            : barcodeConflict
              ? `Mã vạch ${item.value.barcode} đã thuộc sản phẩm khác`
              : undefined);
      return {
        row: item.index + 2,
        code: item.value?.code || null,
        name: item.value?.name || null,
        action: error
          ? 'INVALID'
          : current?.isDeleted
            ? 'RESTORE'
            : current
              ? 'UPDATE'
              : 'CREATE',
        valid: !error,
        message:
          error ||
          (item.value?.stockWasProvided ? 'Cột tồn kho sẽ được bỏ qua' : ''),
      };
    });
    return {
      data: {
        summary: {
          totalRows: rows.length,
          validRows: items.filter((item) => item.valid).length,
          invalidRows: items.filter((item) => !item.valid).length,
          createRows: items.filter((item) => item.action === 'CREATE').length,
          updateRows: items.filter((item) => item.action === 'UPDATE').length,
          restoreRows: items.filter((item) => item.action === 'RESTORE').length,
          stockIgnoredRows: parsed.filter(
            (item: any) => item.value?.stockWasProvided,
          ).length,
        },
        items,
      },
    };
  }

  private async productWorkbook(products: any[]): Promise<Buffer> {
    const categories = await this.categoryModel
      .find({ isDeleted: false })
      .select('name')
      .sort({ name: 1 })
      .lean();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Phúc Long BO';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Hang hoa', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: 'Mã sản phẩm (*)', key: 'code', width: 20 },
      { header: 'Tên sản phẩm (*)', key: 'name', width: 36 },
      { header: 'Mã vạch', key: 'barcode', width: 22 },
      { header: 'Danh mục', key: 'category', width: 26 },
      { header: 'Đơn vị', key: 'unit', width: 14 },
      { header: 'Giá nhập', key: 'costPrice', width: 16 },
      { header: 'Giá bán', key: 'sellPrice', width: 16 },
      { header: 'Tồn tối thiểu', key: 'minStock', width: 18 },
      { header: 'Tồn kho hiện tại (CHỈ XEM)', key: 'stock', width: 28 },
    ];
    products.forEach((item: any) =>
      sheet.addRow({ ...item, category: item.categoryId?.name || '' }),
    );
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1565C0' },
    };
    header.height = 28;
    sheet.autoFilter = { from: 'A1', to: 'I1' };
    sheet.getColumn('code').numFmt = '@';
    sheet.getColumn('barcode').numFmt = '@';
    ['costPrice', 'sellPrice', 'minStock', 'stock'].forEach((column) => {
      sheet.getColumn(column).numFmt = '#,##0';
    });
    sheet.getColumn('stock').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE7E6E6' },
    };
    sheet.getCell('A1').note =
      'Bắt buộc. Đây là khóa để thêm mới hoặc cập nhật sản phẩm.';
    sheet.getCell('B1').note = 'Bắt buộc.';
    sheet.getCell('I1').note =
      'Chỉ để tham khảo. Import không cập nhật tồn kho.';

    const guide = workbook.addWorksheet('HUONG DAN');
    guide.columns = [{ width: 28 }, { width: 90 }];
    const guideRows = [
      ['HƯỚNG DẪN IMPORT HÀNG HÓA', ''],
      [
        'Cách sử dụng',
        'Điền dữ liệu tại sheet Hang hoa rồi import. Không đổi tên hàng tiêu đề.',
      ],
      ['Cột bắt buộc', 'Mã sản phẩm (*) và Tên sản phẩm (*).'],
      [
        'Thêm / cập nhật',
        'Mã chưa có sẽ được thêm mới; mã đã có sẽ được cập nhật.',
      ],
      [
        'Ô để trống',
        'Khi cập nhật, ô tùy chọn để trống sẽ giữ nguyên dữ liệu hiện tại.',
      ],
      [
        'Danh mục',
        'Chọn danh mục có sẵn hoặc nhập tên mới; hệ thống sẽ tự tạo danh mục mới.',
      ],
      [
        'Giá và tồn tối thiểu',
        'Chỉ nhập số lớn hơn hoặc bằng 0. Tồn tối thiểu phải là số nguyên.',
      ],
      [
        'Tồn kho hiện tại',
        'CHỈ XEM và luôn bị bỏ qua khi import. Dùng nghiệp vụ Nhập kho hoặc Kiểm kho để thay đổi tồn.',
      ],
      [
        'Mã trùng trong file',
        'Sẽ báo lỗi từng dòng, không tự cộng hoặc ghi đè âm thầm.',
      ],
      [
        'Khuyến nghị',
        'Luôn kiểm tra kết quả Preview trước khi xác nhận import.',
      ],
    ];
    guideRows.forEach((row) => guide.addRow(row));
    guide.getRow(1).font = {
      bold: true,
      size: 16,
      color: { argb: 'FFFFFFFF' },
    };
    guide.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1565C0' },
    };
    guide.getColumn(1).font = { bold: true };
    guide.eachRow((row) => {
      row.alignment = { vertical: 'top', wrapText: true };
    });

    const categorySheet = workbook.addWorksheet('Danh muc tham khao', {
      state: 'hidden',
    });
    categorySheet.getCell('A1').value = 'Danh mục';
    categories.forEach((category: any, index) => {
      categorySheet.getCell(`A${index + 2}`).value = category.name;
    });
    if (categories.length) {
      (sheet as any).dataValidations.add('D2:D10001', {
        type: 'list',
        allowBlank: true,
        formulae: [`'Danh muc tham khao'!$A$2:$A$${categories.length + 1}`],
        showErrorMessage: false,
      });
    }
    (sheet as any).dataValidations.add('F2:G10001', {
      type: 'decimal',
      operator: 'greaterThanOrEqual',
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Dữ liệu không hợp lệ',
      error: 'Chỉ nhập số lớn hơn hoặc bằng 0',
    });
    (sheet as any).dataValidations.add('H2:H10001', {
      type: 'whole',
      operator: 'greaterThanOrEqual',
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Dữ liệu không hợp lệ',
      error: 'Chỉ nhập số nguyên lớn hơn hoặc bằng 0',
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importTemplate(): Promise<Buffer> {
    return this.productWorkbook([]);
  }

  async exportExcel(): Promise<Buffer> {
    const products = await this.model
      .find({ isDeleted: false })
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .lean();
    return this.productWorkbook(products);
  }
}
