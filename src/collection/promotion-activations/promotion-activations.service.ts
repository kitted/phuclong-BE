import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { ClientSession, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import {
  PromotionActivationCounters,
  PromotionActivations,
  PromotionActivationSource,
  PromotionActivationStatus,
  PromotionStockSource,
} from './schemas/promotion-activations.schema';
import {
  ChangePromotionActivationStatusDto,
  PromotionActivationQueryDto,
  SaveManualPromotionCodeDto,
} from './dtos/promotion-activations.dto';
import { Products } from '../products/schemas/products.schema';
import { Customers } from '../customers/schemas/customers.schema';
import { Users } from '../users/schemas/users.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';

@Injectable()
export class PromotionActivationsService {
  constructor(
    @InjectModel(PromotionActivations)
    private readonly model: ReturnModelType<typeof PromotionActivations>,
    @InjectModel(PromotionActivationCounters)
    private readonly counter: ReturnModelType<
      typeof PromotionActivationCounters
    >,
    @InjectModel(Products)
    private readonly products: ReturnModelType<typeof Products>,
    @InjectModel(Customers)
    private readonly customers: ReturnModelType<typeof Customers>,
    @InjectModel(Users) private readonly users: ReturnModelType<typeof Users>,
    @InjectModel(Trucks)
    private readonly trucks: ReturnModelType<typeof Trucks>,
  ) {}

  private dateParts(date: Date) {
    const d = new Date(date.getTime() + 25200000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return { display: `${dd}${mm}`, key: `${d.getUTCFullYear()}${mm}${dd}` };
  }
  async createForInvoice(input: any, session: ClientSession): Promise<any> {
    if (!input.customer?._id) return null;
    const date = this.dateParts(input.date);
    const prefix =
      String(input.promotion.activationPrefix || input.promotion.code)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 7) || 'KM';
    const customerPart = String(input.customer.code || '')
      .replace(/\D/g, '')
      .slice(-4)
      .padStart(4, '0');
    let code = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const sequence: any = await this.counter.findOneAndUpdate(
        { key: `ACT_${prefix}_${date.key}` },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true, session },
      );
      code = `${prefix}${date.display}${customerPart}${String(sequence.sequence).padStart(3, '0')}`;
      if (!(await this.model.exists({ code }).session(session))) break;
      code = '';
    }
    if (!code)
      throw new BadRequestException('Không thể cấp mã kích hoạt duy nhất');
    return (
      await this.model.create(
        [
          {
            code,
            promotionId: input.promotion._id,
            promotionCode: input.promotion.code,
            promotionName: input.promotion.name,
            invoiceId: input.invoice._id,
            invoiceCode: input.invoice.code,
            customerId: input.customer._id,
            customerCode: input.customer.code || '',
            customerName: input.customer.name,
            customerPhone: input.customer.phone || '',
            salespersonId: input.salesperson._id,
            salespersonCode: input.salesperson.employeeCode || '',
            salespersonName:
              input.salesperson.fullName || input.salesperson.username,
            activatedAt: input.date,
          },
        ],
        { session },
      )
    )[0];
  }
  async findAll(query: PromotionActivationQueryDto): Promise<any> {
    const filter: any = { isDeleted: false };
    for (const key of [
      'promotionId',
      'customerId',
      'salespersonId',
      'invoiceId',
      'status',
      'source',
    ])
      if ((query as any)[key]) filter[key] = (query as any)[key];
    if (query.search)
      filter.$or = [
        'code',
        'promotionCode',
        'promotionName',
        'productCode',
        'productName',
        'invoiceCode',
        'customerCode',
        'customerName',
        'customerPhone',
        'salespersonCode',
        'salespersonName',
      ].map((key) => ({ [key]: { $regex: query.search, $options: 'i' } }));
    if (query.from || query.to) {
      filter.activatedAt = {};
      if (query.from) filter.activatedAt.$gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        filter.activatedAt.$lte = to;
      }
    }
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ activatedAt: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  async findOne(value: string, byCode = false): Promise<any> {
    if (!byCode && !Types.ObjectId.isValid(value))
      throw new BadRequestException('ID không hợp lệ');
    const doc = await this.model
      .findOne({
        [byCode ? 'code' : '_id']: byCode ? value.toUpperCase() : value,
        isDeleted: false,
      })
      .lean();
    if (!doc) throw new NotFoundException('Không tìm thấy mã kích hoạt');
    return { data: doc };
  }
  async changeStatus(
    id: string,
    dto: ChangePromotionActivationStatusDto,
    actorId?: string,
  ): Promise<any> {
    if (dto.status === PromotionActivationStatus.USED)
      throw new BadRequestException(
        'Trạng thái đã sử dụng chỉ được hệ thống ghi nhận từ hóa đơn',
      );
    const existing: any = await this.model
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!existing) throw new NotFoundException('Không tìm thấy mã kích hoạt');
    if (existing.status === PromotionActivationStatus.USED)
      throw new BadRequestException(
        'Mã đã sử dụng không thể chuyển lại sang trạng thái khác',
      );
    if (dto.status !== PromotionActivationStatus.ACTIVE && !dto.reason?.trim())
      throw new BadRequestException('Phải nhập lý do thay đổi trạng thái');
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      {
        status: dto.status,
        statusReason: dto.reason?.trim(),
        statusChangedAt: new Date(),
        statusChangedBy: actorId || undefined,
      },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy mã kích hoạt');
    return { data: doc };
  }

  private codePart(value: unknown, fallback: string): string {
    const raw =
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    const normalized = raw
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/Đ/g, 'D')
      .replace(/[^A-Z0-9_-]+/g, '');
    return normalized || fallback;
  }

  private manualDate(date: Date): string {
    const local = new Date(date.getTime() + 25200000);
    return [
      String(local.getUTCDate()).padStart(2, '0'),
      String(local.getUTCMonth() + 1).padStart(2, '0'),
      String(local.getUTCFullYear()).slice(-2),
    ].join('');
  }

  private manualCode(
    prefix: string,
    product: any,
    salesperson: any,
    customer: any,
    date: Date,
  ): string {
    const customerCode = this.codePart(
      customer.code,
      String(customer._id).slice(-6),
    );
    const customerPart = customerCode.replace(/^KH/i, '') || customerCode;
    return [
      this.codePart(prefix, 'KM'),
      this.codePart(product.code, 'SP'),
      this.manualDate(date),
      this.codePart(
        salesperson.fullName ||
          salesperson.username ||
          salesperson.employeeCode,
        'SALE',
      ),
      customerPart,
    ].join('/');
  }

  private async manualReferences(
    dto: SaveManualPromotionCodeDto,
  ): Promise<{ product: any; customer: any; salesperson: any }> {
    const [product, customer, salesperson] = await Promise.all([
      this.products
        .findOne({ _id: dto.productId, isDeleted: { $ne: true } })
        .lean(),
      this.customers
        .findOne({ _id: dto.customerId, isDeleted: { $ne: true } })
        .lean(),
      this.users
        .findOne({ _id: dto.salespersonId, isDeleted: { $ne: true } })
        .lean(),
    ]);
    if (!product)
      throw new NotFoundException('Không tìm thấy sản phẩm khuyến mãi');
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    if (!salesperson)
      throw new NotFoundException('Không tìm thấy nhân viên sale');
    return { product, customer, salesperson };
  }

  private async stockSource(dto: SaveManualPromotionCodeDto, product: any) {
    const requestedQuantity = Number(dto.giftQuantity) || 1;
    if (dto.stockSource === PromotionStockSource.WAREHOUSE)
      return {
        stockSource: PromotionStockSource.WAREHOUSE,
        sourceTruckId: null,
        sourceTruckCode: null,
        sourceTruckName: null,
        availableQuantityAtCreation: Math.max(0, Number(product.stock) || 0),
        stockWarning: (Number(product.stock) || 0) < requestedQuantity,
      };
    const truck: any = await this.trucks
      .findOne({ _id: dto.sourceTruckId, isDeleted: { $ne: true } })
      .select('code name inventory')
      .lean();
    if (!truck)
      throw new NotFoundException('Không tìm thấy xe xuất hàng khuyến mãi');
    const available = Number(
      (truck.inventory || []).find(
        (item: any) => String(item.productId) === String(product._id),
      )?.qty || 0,
    );
    return {
      stockSource: PromotionStockSource.TRUCK,
      sourceTruckId: truck._id,
      sourceTruckCode: truck.code,
      sourceTruckName: truck.name,
      availableQuantityAtCreation: Math.max(0, available),
      stockWarning: available < requestedQuantity,
    };
  }

  async createManual(
    dto: SaveManualPromotionCodeDto,
    actorId: string,
  ): Promise<any> {
    const { product, customer, salesperson } = await this.manualReferences(dto);
    const source = await this.stockSource(dto, product);
    const activatedAt = new Date(),
      prefix = this.codePart(dto.prefix, 'KM');
    const code = dto.code?.trim()
      ? String(dto.code).trim().toUpperCase()
      : this.manualCode(prefix, product, salesperson, customer, activatedAt);
    if (await this.model.exists({ code }))
      throw new BadRequestException(
        'Mã khuyến mãi đã tồn tại, vui lòng chỉnh lại mã',
      );
    const doc = await this.model.create({
      code,
      source: PromotionActivationSource.MANUAL,
      customPrefix: prefix,
      // Keep compatibility with deployments that still have the historical
      // non-sparse unique invoiceId index. Manual codes never resolve this ID.
      invoiceId: new Types.ObjectId(),
      invoiceCode: 'MANUAL',
      productId: product._id,
      productCode: product.code,
      productName: product.name,
      giftQuantity: Number(dto.giftQuantity) || 1,
      ...source,
      customerId: customer._id,
      customerCode: customer.code || '',
      customerName: customer.name,
      customerPhone: customer.phone || '',
      salespersonId: salesperson._id,
      salespersonCode: salesperson.employeeCode || '',
      salespersonName: salesperson.fullName || salesperson.username,
      activatedAt,
      status: PromotionActivationStatus.ACTIVE,
      createdBy: actorId,
    });
    return { data: doc };
  }

  async updateManual(
    id: string,
    dto: SaveManualPromotionCodeDto,
    actorId: string,
  ): Promise<any> {
    const existing: any = await this.model.findOne({
      _id: id,
      source: PromotionActivationSource.MANUAL,
      isDeleted: false,
    });
    if (!existing)
      throw new NotFoundException('Không tìm thấy mã khuyến mãi tạo nhanh');
    if (existing.status === PromotionActivationStatus.USED)
      throw new BadRequestException('Mã đã sử dụng không thể chỉnh sửa');
    const { product, customer, salesperson } = await this.manualReferences(dto);
    const source = await this.stockSource(dto, product);
    const prefix = this.codePart(dto.prefix, 'KM');
    const code = dto.code?.trim()
      ? String(dto.code).trim().toUpperCase()
      : this.manualCode(
          prefix,
          product,
          salesperson,
          customer,
          existing.activatedAt || new Date(),
        );
    if (await this.model.exists({ _id: { $ne: id }, code }))
      throw new BadRequestException(
        'Mã khuyến mãi đã tồn tại, vui lòng chỉnh lại mã',
      );
    Object.assign(existing, {
      code,
      customPrefix: prefix,
      productId: product._id,
      productCode: product.code,
      productName: product.name,
      giftQuantity: Number(dto.giftQuantity) || 1,
      ...source,
      customerId: customer._id,
      customerCode: customer.code || '',
      customerName: customer.name,
      customerPhone: customer.phone || '',
      salespersonId: salesperson._id,
      salespersonCode: salesperson.employeeCode || '',
      salespersonName: salesperson.fullName || salesperson.username,
      updatedBy: actorId,
    });
    await existing.save();
    return { data: existing };
  }

  async export(query: PromotionActivationQueryDto): Promise<Buffer> {
    const filter: any = { isDeleted: false };
    for (const key of [
      'promotionId',
      'customerId',
      'salespersonId',
      'invoiceId',
      'status',
      'source',
    ])
      if ((query as any)[key]) filter[key] = (query as any)[key];
    if (query.from || query.to) {
      filter.activatedAt = {};
      if (query.from) filter.activatedAt.$gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        filter.activatedAt.$lte = to;
      }
    }
    if (query.search)
      filter.$or = [
        'code',
        'productCode',
        'productName',
        'customerCode',
        'customerName',
        'customerPhone',
        'salespersonCode',
        'salespersonName',
      ].map((key) => ({ [key]: { $regex: query.search, $options: 'i' } }));
    const rows: any[] = await this.model
      .find(filter)
      .sort({ activatedAt: -1, createdAt: -1 })
      .lean();
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Mã khuyến mãi', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
    sheet.columns = [
      { header: 'STT', key: 'stt', width: 7 },
      { header: 'Mã khuyến mãi', key: 'code', width: 42 },
      { header: 'Nguồn tạo', key: 'source', width: 15 },
      { header: 'Sản phẩm', key: 'productName', width: 30 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 18 },
      { header: 'Số lượng tặng', key: 'giftQuantity', width: 16 },
      { header: 'Nguồn xuất quà', key: 'stockSourceLabel', width: 20 },
      { header: 'Xe xuất quà', key: 'sourceTruckName', width: 25 },
      {
        header: 'Tồn tại lúc tạo',
        key: 'availableQuantityAtCreation',
        width: 18,
      },
      { header: 'Cảnh báo tồn', key: 'stockWarningLabel', width: 18 },
      { header: 'Khách hàng', key: 'customerName', width: 30 },
      { header: 'Mã khách hàng', key: 'customerCode', width: 16 },
      { header: 'Số điện thoại', key: 'customerPhone', width: 17 },
      { header: 'Nhân viên sale', key: 'salespersonName', width: 26 },
      { header: 'Mã nhân viên', key: 'salespersonCode', width: 16 },
      { header: 'Ngày tạo', key: 'activatedAt', width: 20 },
      { header: 'Trạng thái', key: 'status', width: 16 },
    ];
    rows.forEach((row, index) =>
      sheet.addRow({
        stt: index + 1,
        ...row,
        source:
          row.source === PromotionActivationSource.MANUAL
            ? 'Tạo nhanh'
            : 'Từ hóa đơn',
        stockSourceLabel:
          row.stockSource === PromotionStockSource.TRUCK
            ? 'Xe bán hàng'
            : 'Kho chính',
        giftQuantity: Number(row.giftQuantity) || 1,
        stockWarningLabel: row.stockWarning ? 'Không đủ hàng' : 'Đủ hàng',
        activatedAt: row.activatedAt || row.createdAt,
      }),
    );
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1565C0' },
    };
    sheet.autoFilter = { from: 'A1', to: 'Q1' };
    sheet.getColumn('activatedAt').numFmt = 'dd/mm/yyyy hh:mm';
    return Buffer.from(await book.xlsx.writeBuffer());
  }
}
