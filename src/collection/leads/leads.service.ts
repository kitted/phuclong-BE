import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Leads, LeadInteractionResult } from './schemas/leads.schema';
import {
  CreateLeadDto,
  CreateLeadInteractionDto,
  LeadQueryDto,
  UpdateLeadDto,
} from './dtos/leads.dto';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';

const normalizePhone = (value?: string) =>
  String(value || '')
    .replace(/\D/g, '')
    .replace(/^84(?=\d{9}$)/, '0');

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Leads) private readonly model: ReturnModelType<typeof Leads>,
  ) {}

  async list(query: LeadQueryDto): Promise<any> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const filter: any = { isDeleted: { $ne: true } };
    if (query.status === 'OPEN') filter.converted = { $ne: true };
    if (query.status === 'CONVERTED') filter.converted = true;
    if (query.search?.trim()) {
      const regex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { name: regex },
        { phone: regex },
        { contactName: regex },
        { businessType: regex },
        { createdByName: regex },
        { createdByCode: regex },
        { 'location.address': regex },
      ];
    }
    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ updatedAt: -1 })
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
  async findOne(id: string): Promise<any> {
    const data = await this.model
      .findOne({ _id: id, isDeleted: { $ne: true } })
      .lean();
    if (!data) throw new NotFoundException('Không tìm thấy lead');
    return { data };
  }
  async create(dto: CreateLeadDto, actor: any = {}): Promise<any> {
    const data = await this.model.create({
      ...dto,
      phone: normalizePhone(dto.phone),
      createdBy: actor.id || undefined,
      createdByName: actor.name || 'Nhân viên',
      createdByCode: actor.employeeCode || undefined,
    });
    return { data };
  }
  async update(id: string, dto: UpdateLeadDto): Promise<any> {
    const data = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: { ...dto, phone: normalizePhone(dto.phone) } },
      { new: true },
    );
    if (!data) throw new NotFoundException('Không tìm thấy lead');
    return { data };
  }
  async remove(id: string): Promise<any> {
    const data = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true },
    );
    if (!data) throw new NotFoundException('Không tìm thấy lead');
    return { data };
  }
  private configureCloudinary(): void {
    const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
    const api_key = process.env.CLOUDINARY_API_KEY;
    const api_secret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud_name || !api_key || !api_secret)
      throw new BadRequestException(
        'Cloudinary chưa được cấu hình trên backend',
      );
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  }
  private uploadBuffer(
    buffer: Buffer,
    folder: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: [
            {
              width: 1600,
              height: 1600,
              crop: 'limit',
              quality: 'auto',
              fetch_format: 'auto',
            },
          ],
        },
        (error, result) =>
          error || !result
            ? reject(error || new Error('Không tải được ảnh'))
            : resolve(result),
      );
      stream.end(buffer);
    });
  }
  async uploadImage(id: string, file: any): Promise<any> {
    if (!file?.buffer) throw new BadRequestException('Vui lòng chọn ảnh');
    if (file.size > 5 * 1024 * 1024)
      throw new BadRequestException('Ảnh không được vượt quá 5 MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      throw new BadRequestException('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP');
    const lead: any = await this.model.findOne({
      _id: id,
      isDeleted: { $ne: true },
    });
    if (!lead) throw new NotFoundException('Không tìm thấy lead');
    this.configureCloudinary();
    const uploaded = await this.uploadBuffer(file.buffer, `leads/${id}`);
    const oldPublicId = lead.imagePublicId;
    lead.imageUrl = uploaded.secure_url;
    lead.imagePublicId = uploaded.public_id;
    await lead.save();
    if (oldPublicId && oldPublicId !== uploaded.public_id)
      await cloudinary.uploader
        .destroy(oldPublicId, { resource_type: 'image' })
        .catch(() => undefined);
    return { data: lead };
  }
  async interact(
    id: string,
    dto: CreateLeadInteractionDto,
    actor: any,
  ): Promise<any> {
    const lead: any = await this.model.findOne({
      _id: id,
      isDeleted: { $ne: true },
    });
    if (!lead) throw new NotFoundException('Không tìm thấy lead');
    lead.interactions.push({
      salespersonId: actor.id,
      salespersonName: actor.name || 'Nhân viên',
      salespersonCode: actor.employeeCode || undefined,
      note: dto.note.trim(),
      result: dto.result || LeadInteractionResult.VISITED,
      interactedAt: new Date(),
    });
    await lead.save();
    return { data: lead };
  }
  async promoteForInvoice(
    input: {
      name?: string;
      phone?: string;
      latitude?: number;
      longitude?: number;
    },
    customerId: string,
    invoiceId: string,
    salesperson: { id: string; name?: string; employeeCode?: string },
    session: any,
  ): Promise<void> {
    const phone = normalizePhone(input.phone);
    const clauses: any[] = [];
    if (phone) clauses.push({ phone });
    if (input.name?.trim())
      clauses.push({
        name: new RegExp(
          `^${input.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          'i',
        ),
      });
    if (!clauses.length) return;
    const candidates: any[] = await this.model
      .find({
        isDeleted: { $ne: true },
        converted: { $ne: true },
        $or: clauses,
      })
      .session(session);
    const lead = candidates.find(
      (item) =>
        !input.latitude ||
        (Math.abs(Number(item.location?.latitude) - Number(input.latitude)) <
          0.002 &&
          Math.abs(Number(item.location?.longitude) - Number(input.longitude)) <
            0.002),
    );
    if (!lead) return;
    lead.converted = true;
    lead.customerId = customerId;
    lead.convertedAt = new Date();
    lead.interactions.push({
      salespersonId: salesperson.id,
      salespersonName: salesperson.name || 'Nhân viên',
      salespersonCode: salesperson.employeeCode || undefined,
      note: 'Tự động chuyển thành khách hàng khi phát sinh hóa đơn; khách hàng chưa có mã KH.',
      result: LeadInteractionResult.SOLD,
      customerId,
      invoiceId,
      interactedAt: new Date(),
    });
    await lead.save({ session });
  }
}
