import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { Customers } from './schemas/customers.schema';
import { CreateCustomerDto, CreateInteractionDto, CustomerQueryDto, UpdateCustomerDto } from './dtos/customers.dto';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { Vouchers } from '../promotions/schemas/promotions.schema';
import * as ExcelJS from 'exceljs';
import { excelBoolean, excelNumber, excelValue, normalizeExcelRow } from '../../core/excel-import';
import { CustomerSegment, CustomerSource } from './schemas/customers.schema';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customers) private readonly model: ReturnModelType<typeof Customers>,
    @InjectModel(Invoices) private readonly invoiceModel: ReturnModelType<typeof Invoices>,
    @InjectModel(Vouchers) private readonly voucherModel: ReturnModelType<typeof Vouchers>,
  ) {}

  private page(value: string | undefined, fallback: number, max?: number) {
    const n = Number(value || fallback);
    if (!Number.isInteger(n) || n < 1 || (max && n > max)) throw new BadRequestException('Tham số phân trang không hợp lệ');
    return n;
  }

  private async nextCode() {
    const latest = await this.model.findOne().sort({ createdAt: -1 }).select('code').lean();
    const next = Number(latest?.code?.match(/\d+$/)?.[0] || 0) + 1;
    return `KH-${String(next).padStart(3, '0')}`;
  }

  async create(dto: CreateCustomerDto) {
    const phone = dto.phone.trim();
    if (await this.model.exists({ phone, isDeleted: false })) throw new BadRequestException('Số điện thoại đã tồn tại');
    return { data: await this.model.create({ ...dto, phone, name: dto.name.trim(), code: await this.nextCode() }) };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    if (dto.phone && await this.model.exists({ phone: dto.phone.trim(), _id: { $ne: id }, isDeleted: false })) {
      throw new BadRequestException('Số điện thoại đã tồn tại');
    }
    const customer = await this.model.findOneAndUpdate({ _id: id, isDeleted: false }, dto, { new: true });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return { data: customer };
  }

  async findAll(query: CustomerQueryDto): Promise<any> {
    const page = this.page(query.page, 1); const limit = this.page(query.limit, 20, 100);
    const filter: any = { isDeleted: false };
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['code', 'name', 'phone'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
    }
    if (query.source) filter.source = query.source;
    if (query.segment) filter.segment = query.segment;
    if (query.zaloConnected === 'true' || query.zaloConnected === 'false') filter.zaloConnected = query.zaloConnected === 'true';
    if (query.debtWarning === true || String(query.debtWarning) === 'true') filter.$expr = { $and: [{ $gt: [{ $ifNull: ['$debt', 0] }, 0] }, { $gte: [{ $ifNull: ['$debt', 0] }, { $ifNull: ['$debtLimit', 0] }] }] };
    const [data, totalItems] = await Promise.all([
      this.model.find(filter).select('code name phone email address source segment zaloConnected debt debtLimit note createdAt updatedAt').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: data.map((customer: any) => ({ ...customer, id: String(customer._id), availableDebtLimit: customer.debtLimit > 0 ? Math.max(0, customer.debtLimit - (customer.debt || 0)) : 0, debtWarning: (customer.debt || 0) > 0 && (customer.debt || 0) >= (customer.debtLimit || 0) })),
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async summary() {
    const rows = await this.model.find({ isDeleted: false }).select('zaloConnected source debt debtLimit').lean();
    return { data: {
      totalCustomers: rows.length,
      zaloConnected: rows.filter((x) => x.zaloConnected).length,
      leads: rows.filter((x) => x.source === 'LEAD').length,
      debtWarnings: rows.filter((x) => (x.debt || 0) > 0 && (x.debt || 0) >= (x.debtLimit || 0)).length,
      totalDebt: rows.reduce((sum, x) => sum + (x.debt || 0), 0),
    } };
  }

  async findOne(id: string) {
    const customer: any = await this.model.findOne({ _id: id, isDeleted: false }).lean();
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    const [invoices, vouchers] = await Promise.all([
      this.invoiceModel.find({ customerId: id, isDeleted: false }).sort({ date: -1 }).lean(),
      this.voucherModel.find({ customerId: id, isDeleted: false }).populate('promotionId', 'name discountType discountValue').sort({ createdAt: -1 }).lean(),
    ]);
    const totalSpent = invoices.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
    return { data: {
      ...customer,
      id: String(customer._id),
      totalSpent,
      orderCount: invoices.length,
      lastOrderAt: invoices[0]?.date || null,
      invoices: invoices.map((x: any) => ({ id: String(x._id), code: x.code, date: x.date, total: x.totalAmount, paid: x.paidAmount || 0, status: x.paymentStatus || 'UNPAID' })),
      vouchers: vouchers.map((x: any) => ({ id: String(x._id), code: x.code, campaign: x.promotionId?.name, benefit: x.promotionId?.discountType === 'PERCENT' ? `Giảm ${x.promotionId.discountValue}%` : `Giảm ${x.promotionId?.discountValue || 0}đ`, expiresAt: x.expiresAt, status: x.status })),
      interactions: (customer.interactions || []).slice().reverse().map((x) => ({ ...x, id: String(x._id) })),
    } };
  }

  async addInteraction(id: string, dto: CreateInteractionDto) {
    const customer = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $push: { interactions: { ...dto, at: new Date() } } },
      { new: true },
    );
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return { data: customer.interactions[customer.interactions.length - 1] };
  }

  async importRows(rows: Record<string, unknown>[]): Promise<any> {
    if (!Array.isArray(rows) || !rows.length) throw new BadRequestException('File import không có dữ liệu');
    if (rows.length > 10000) throw new BadRequestException('Mỗi lần chỉ được import tối đa 10.000 dòng');
    let created = 0; let updated = 0;
    const errors: Array<{ row: number; message: string; data: Record<string, unknown> }> = [];
    const validSources = Object.values(CustomerSource);
    const validSegments = Object.values(CustomerSegment);

    for (let index = 0; index < rows.length; index++) {
      const original = rows[index];
      try {
        const row = normalizeExcelRow(original);
        const name = String(excelValue(row, ['Tên khách hàng', 'Tên', 'name'])).trim();
        const phone = String(excelValue(row, ['Số điện thoại', 'Điện thoại', 'phone'])).replace(/\s/g, '');
        if (!name || !phone) throw new Error('Thiếu tên khách hàng hoặc số điện thoại');
        const source = String(excelValue(row, ['Nguồn', 'source'])).trim().toUpperCase() as CustomerSource;
        const segment = String(excelValue(row, ['Phân loại', 'segment'])).trim().toUpperCase() as CustomerSegment;
        const payload: any = {
          name,
          phone,
          email: String(excelValue(row, ['Email', 'email'])).trim() || undefined,
          address: String(excelValue(row, ['Địa chỉ', 'address'])).trim() || undefined,
          zaloConnected: excelBoolean(excelValue(row, ['Đã kết bạn Zalo', 'Zalo', 'zaloConnected'])),
          debtLimit: Math.max(0, excelNumber(excelValue(row, ['Hạn mức công nợ', 'debtLimit']))),
          note: String(excelValue(row, ['Ghi chú', 'note'])).trim() || undefined,
        };
        if (validSources.includes(source)) payload.source = source;
        if (validSegments.includes(segment)) payload.segment = segment;
        const existing = await this.model.findOne({ phone, isDeleted: false }).select('_id').lean();
        if (existing) {
          await this.model.updateOne({ _id: existing._id }, { $set: payload });
          updated++;
        } else {
          await this.model.create({ ...payload, code: await this.nextCode() });
          created++;
        }
      } catch (error) {
        errors.push({ row: index + 2, message: error instanceof Error ? error.message : 'Không thể lưu khách hàng', data: original });
      }
    }
    return { data: { totalRows: rows.length, created, updated, failed: errors.length, errors } };
  }

  async exportExcel(): Promise<Buffer> {
    const customers = await this.model.find({ isDeleted: false }).sort({ createdAt: -1 }).lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Khach hang');
    sheet.columns = [
      { header: 'Mã khách hàng', key: 'code', width: 18 }, { header: 'Tên khách hàng', key: 'name', width: 30 },
      { header: 'Số điện thoại', key: 'phone', width: 18 }, { header: 'Email', key: 'email', width: 28 },
      { header: 'Địa chỉ', key: 'address', width: 32 }, { header: 'Nguồn', key: 'source', width: 14 },
      { header: 'Phân loại', key: 'segment', width: 18 }, { header: 'Đã kết bạn Zalo', key: 'zaloConnected', width: 20 },
      { header: 'Công nợ', key: 'debt', width: 16 }, { header: 'Hạn mức công nợ', key: 'debtLimit', width: 20 },
      { header: 'Ghi chú', key: 'note', width: 32 },
    ];
    customers.forEach((item: any) => sheet.addRow({ ...item, zaloConnected: item.zaloConnected ? 'Có' : 'Không' }));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'K1' };
    sheet.getColumn('phone').numFmt = '@'; sheet.getColumn('debt').numFmt = '#,##0'; sheet.getColumn('debtLimit').numFmt = '#,##0';
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
