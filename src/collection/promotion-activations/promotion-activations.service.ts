import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { ClientSession, Types } from 'mongoose';
import { PromotionActivationCounters, PromotionActivations, PromotionActivationStatus } from './schemas/promotion-activations.schema';
import { ChangePromotionActivationStatusDto, PromotionActivationQueryDto } from './dtos/promotion-activations.dto';

@Injectable()
export class PromotionActivationsService {
  constructor(
    @InjectModel(PromotionActivations) private readonly model: ReturnModelType<typeof PromotionActivations>,
    @InjectModel(PromotionActivationCounters) private readonly counter: ReturnModelType<typeof PromotionActivationCounters>,
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
    const prefix = String(input.promotion.activationPrefix || input.promotion.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) || 'KM';
    const customerPart = String(input.customer.code || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
    let code = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const sequence: any = await this.counter.findOneAndUpdate({ key: `ACT_${prefix}_${date.key}` }, { $inc: { sequence: 1 } }, { upsert: true, new: true, session });
      code = `${prefix}${date.display}${customerPart}${String(sequence.sequence).padStart(3, '0')}`;
      if (!await this.model.exists({ code }).session(session)) break;
      code = '';
    }
    if (!code) throw new BadRequestException('Không thể cấp mã kích hoạt duy nhất');
    return (await this.model.create([{
      code, promotionId: input.promotion._id, promotionCode: input.promotion.code, promotionName: input.promotion.name,
      invoiceId: input.invoice._id, invoiceCode: input.invoice.code,
      customerId: input.customer._id, customerCode: input.customer.code || '', customerName: input.customer.name, customerPhone: input.customer.phone || '',
      salespersonId: input.salesperson._id, salespersonCode: input.salesperson.employeeCode || '', salespersonName: input.salesperson.fullName || input.salesperson.username,
      activatedAt: input.date,
    }], { session }))[0];
  }
  async findAll(query: PromotionActivationQueryDto): Promise<any> {
    const filter: any = { isDeleted: false };
    for (const key of ['promotionId', 'customerId', 'salespersonId', 'invoiceId', 'status']) if ((query as any)[key]) filter[key] = (query as any)[key];
    if (query.search) filter.$or = ['code', 'promotionCode', 'promotionName', 'invoiceCode', 'customerCode', 'customerName', 'customerPhone', 'salespersonCode', 'salespersonName'].map((key) => ({ [key]: { $regex: query.search, $options: 'i' } }));
    if (query.from || query.to) { filter.activatedAt = {}; if (query.from) filter.activatedAt.$gte = new Date(query.from); if (query.to) { const to = new Date(query.to); to.setHours(23, 59, 59, 999); filter.activatedAt.$lte = to; } }
    const page = Number(query.page) || 1; const limit = Number(query.limit) || 20;
    const [data, total] = await Promise.all([this.model.find(filter).sort({ activatedAt: -1, createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), this.model.countDocuments(filter)]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
  async findOne(value: string, byCode = false): Promise<any> {
    if (!byCode && !Types.ObjectId.isValid(value)) throw new BadRequestException('ID không hợp lệ');
    const doc = await this.model.findOne({ [byCode ? 'code' : '_id']: byCode ? value.toUpperCase() : value, isDeleted: false }).lean();
    if (!doc) throw new NotFoundException('Không tìm thấy mã kích hoạt');
    return { data: doc };
  }
  async changeStatus(id: string, dto: ChangePromotionActivationStatusDto, actorId?: string): Promise<any> {
    if (dto.status !== PromotionActivationStatus.ACTIVE && !dto.reason?.trim()) throw new BadRequestException('Phải nhập lý do thay đổi trạng thái');
    const doc = await this.model.findOneAndUpdate({ _id: id, isDeleted: false }, { status: dto.status, statusReason: dto.reason?.trim(), statusChangedAt: new Date(), statusChangedBy: actorId || undefined }, { new: true });
    if (!doc) throw new NotFoundException('Không tìm thấy mã kích hoạt');
    return { data: doc };
  }
}
