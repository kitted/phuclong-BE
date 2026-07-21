import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { Customers } from './schemas/customers.schema';
import { CreateCustomerDto, CreateInteractionDto, CustomerQueryDto, UpdateCustomerDto } from './dtos/customers.dto';
import { Invoices } from '../invoices/schemas/invoices.schema';
import { Vouchers } from '../promotions/schemas/promotions.schema';

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
    if (query.debtWarning === 'true') filter.$expr = { $and: [{ $gt: ['$debtLimit', 0] }, { $gte: ['$debt', '$debtLimit'] }] };
    const [data, totalItems] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return {
      data: data.map((customer: any) => ({ ...customer, id: String(customer._id) })),
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  async summary() {
    const rows = await this.model.find({ isDeleted: false }).select('zaloConnected source debt debtLimit').lean();
    return { data: {
      totalCustomers: rows.length,
      zaloConnected: rows.filter((x) => x.zaloConnected).length,
      leads: rows.filter((x) => x.source === 'LEAD').length,
      debtWarnings: rows.filter((x) => x.debtLimit > 0 && x.debt >= x.debtLimit).length,
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
}
