import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { WebsiteOrdersService } from '../website-orders/website-orders.service';
import {
  CreateWebsiteContentCategoryDto,
  CreateWebsiteContentDto,
  CreateWebsiteSettingDto,
  UpdateWebsiteContentCategoryDto,
  UpdateWebsiteContentDto,
  UpdateWebsiteSettingDto,
  WebsiteContentQueryDto,
} from './dtos/website-contents.dto';
import { WebsiteContents, WebsiteContentStatus } from './schemas/website-contents.schema';
import { WebsiteContentCategories } from './schemas/website-content-categories.schema';
import { WebsiteSettings, WebsiteSettingType } from './schemas/website-settings.schema';

@Injectable()
export class WebsiteContentsService {
  constructor(
    @InjectModel(WebsiteContents) private readonly model: ReturnModelType<typeof WebsiteContents>,
    @InjectModel(WebsiteContentCategories)
    private readonly categories: ReturnModelType<typeof WebsiteContentCategories>,
    @InjectModel(WebsiteSettings)
    private readonly settings: ReturnModelType<typeof WebsiteSettings>,
    private readonly websiteOrders: WebsiteOrdersService,
  ) {}

  private slug(value: string): string {
    const slug = String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) throw new BadRequestException('Slug không hợp lệ');
    return slug;
  }

  private sanitize(html: string): string {
    return String(html || '')
      .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript\s*:/gi, '');
  }

  private publicView(doc: any, includeContent = true): any {
    const data: any = { id: String(doc._id), title: doc.title, slug: doc.slug, type: doc.type, categoryId: doc.categoryId, excerpt: doc.excerpt, coverImageUrl: doc.coverImageUrl, hashtags: doc.hashtags || [], requiresCustomerVerification: Boolean(doc.requiresCustomerVerification), publishedAt: doc.publishedAt, createdAt: doc.createdAt, updatedAt: doc.updatedAt };
    if (includeContent) data.contentHtml = doc.contentHtml;
    return data;
  }

  async create(dto: CreateWebsiteContentDto, actorId: string): Promise<any> {
    await this.ensureCategory(dto.categoryId);
    const status = dto.status || WebsiteContentStatus.DRAFT;
    const doc = await this.model.create({ ...dto, slug: this.slug(dto.slug), contentHtml: this.sanitize(dto.contentHtml), hashtags: (dto.hashtags || []).map((x) => x.trim().replace(/^#/, '')).filter(Boolean), status, publishedAt: status === WebsiteContentStatus.PUBLISHED ? new Date(dto.publishedAt || Date.now()) : dto.publishedAt ? new Date(dto.publishedAt) : undefined, createdBy: actorId });
    return { data: doc };
  }

  async update(id: string, dto: UpdateWebsiteContentDto, actorId: string): Promise<any> {
    await this.ensureCategory(dto.categoryId);
    const changes: any = { ...dto, updatedBy: actorId };
    if (dto.slug !== undefined) changes.slug = this.slug(dto.slug);
    if (dto.contentHtml !== undefined) changes.contentHtml = this.sanitize(dto.contentHtml);
    if (dto.hashtags !== undefined) changes.hashtags = dto.hashtags.map((x) => x.trim().replace(/^#/, '')).filter(Boolean);
    if (dto.publishedAt !== undefined) changes.publishedAt = new Date(dto.publishedAt);
    if (dto.status === WebsiteContentStatus.PUBLISHED && !dto.publishedAt) changes.publishedAt = new Date();
    const doc = await this.model.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: changes }, { new: true });
    if (!doc) throw new NotFoundException('Không tìm thấy nội dung website');
    return { data: doc };
  }

  async adminList(q: WebsiteContentQueryDto): Promise<any> {
    return this.list(q, false);
  }

  async publicList(q: WebsiteContentQueryDto): Promise<any> {
    return this.list(q, true);
  }

  private async list(q: WebsiteContentQueryDto, publicOnly: boolean): Promise<any> {
    const page = Math.max(1, Number(q.page) || 1), limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const filter: any = { isDeleted: false };
    if (publicOnly) { filter.status = WebsiteContentStatus.PUBLISHED; filter.publishedAt = { $lte: new Date() }; }
    else if (q.status) filter.status = q.status;
    if (q.type) filter.type = q.type;
    if (q.categoryId) filter.categoryId = q.categoryId;
    if (q.hashtag) filter.hashtags = q.hashtag.replace(/^#/, '');
    if (q.requiresCustomerVerification !== undefined) filter.requiresCustomerVerification = q.requiresCustomerVerification;
    if (q.search?.trim()) { const escaped = q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ title: new RegExp(escaped, 'i') }, { excerpt: new RegExp(escaped, 'i') }, { hashtags: new RegExp(escaped, 'i') }]; }
    const [rows, total] = await Promise.all([this.model.find(filter).select(publicOnly ? '-contentHtml -createdBy -updatedBy' : '').sort({ publishedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), this.model.countDocuments(filter)]);
    return { data: publicOnly ? rows.map((row: any) => this.publicView(row, false)) : rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async published(slug: string): Promise<any> {
    const doc = await this.model.findOne({ slug: this.slug(slug), status: WebsiteContentStatus.PUBLISHED, publishedAt: { $lte: new Date() }, isDeleted: false }).lean();
    if (!doc) throw new NotFoundException('Không tìm thấy nội dung website');
    return doc;
  }

  async publicDetail(slug: string): Promise<any> {
    const doc: any = await this.published(slug);
    return { data: this.publicView(doc, !doc.requiresCustomerVerification) };
  }

  async access(slug: string, customerCode: string, phone: string): Promise<any> {
    const doc: any = await this.published(slug);
    if (doc.requiresCustomerVerification) await this.websiteOrders.verifyCustomer(customerCode, phone);
    return { data: this.publicView(doc, true) };
  }

  async adminDetail(id: string): Promise<any> {
    const doc = await this.model.findOne({ _id: id, isDeleted: false }).lean();
    if (!doc) throw new NotFoundException('Không tìm thấy nội dung website');
    return { data: doc };
  }

  async remove(id: string, actorId: string): Promise<any> {
    const doc = await this.model.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId } }, { new: true });
    if (!doc) throw new NotFoundException('Không tìm thấy nội dung website');
    return { data: { id, deleted: true } };
  }

  private async ensureCategory(categoryId?: string): Promise<void> {
    if (!categoryId) return;
    if (!(await this.categories.exists({ _id: categoryId, isDeleted: false })))
      throw new BadRequestException('Danh mục nội dung không tồn tại');
  }

  async createCategory(dto: CreateWebsiteContentCategoryDto, actorId: string): Promise<any> {
    const doc = await this.categories.create({
      ...dto,
      name: dto.name.trim(),
      slug: this.slug(dto.slug),
      createdBy: actorId,
    });
    return { data: doc };
  }

  async updateCategory(id: string, dto: UpdateWebsiteContentCategoryDto, actorId: string): Promise<any> {
    const changes: any = { ...dto, updatedBy: actorId };
    if (dto.name !== undefined) changes.name = dto.name.trim();
    if (dto.slug !== undefined) changes.slug = this.slug(dto.slug);
    const doc = await this.categories.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: changes },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy danh mục nội dung');
    return { data: doc };
  }

  async listCategories(publicOnly: boolean): Promise<any> {
    const filter: any = { isDeleted: false };
    if (publicOnly) filter.isActive = true;
    const data = await this.categories
      .find(filter)
      .select(publicOnly ? '-createdBy -updatedBy' : '')
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    return { data };
  }

  async removeCategory(id: string, actorId: string): Promise<any> {
    if (await this.model.exists({ categoryId: id, isDeleted: false }))
      throw new BadRequestException('Danh mục đang được sử dụng bởi nội dung website');
    const doc = await this.categories.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy danh mục nội dung');
    return { data: { id, deleted: true } };
  }

  private settingValue(type: WebsiteSettingType, value: string): string {
    if (type === WebsiteSettingType.JSON) {
      try {
        JSON.parse(value);
      } catch {
        throw new BadRequestException('Giá trị cấu hình JSON không hợp lệ');
      }
    }
    return type === WebsiteSettingType.RICH_TEXT ? this.sanitize(value) : value.trim();
  }

  async createSetting(dto: CreateWebsiteSettingDto, actorId: string): Promise<any> {
    const doc = await this.settings.create({
      ...dto,
      key: dto.key.trim().toUpperCase(),
      label: dto.label.trim(),
      group: dto.group.trim().toUpperCase(),
      value: this.settingValue(dto.type, dto.value),
      createdBy: actorId,
    });
    return { data: doc };
  }

  async updateSetting(id: string, dto: UpdateWebsiteSettingDto, actorId: string): Promise<any> {
    const existing = await this.settings.findOne({ _id: id, isDeleted: false });
    if (!existing) throw new NotFoundException('Không tìm thấy cấu hình website');
    const changes: any = { ...dto, updatedBy: actorId };
    if (dto.key !== undefined) changes.key = dto.key.trim().toUpperCase();
    if (dto.label !== undefined) changes.label = dto.label.trim();
    if (dto.group !== undefined) changes.group = dto.group.trim().toUpperCase();
    if (dto.value !== undefined)
      changes.value = this.settingValue(dto.type || existing.type, dto.value);
    if (dto.type !== undefined && dto.value === undefined)
      changes.value = this.settingValue(dto.type, existing.value);
    Object.assign(existing, changes);
    await existing.save();
    return { data: existing };
  }

  async listSettings(publicOnly: boolean, group?: string): Promise<any> {
    const filter: any = { isDeleted: false };
    if (publicOnly) Object.assign(filter, { isPublic: true, isActive: true });
    if (group?.trim()) filter.group = group.trim().toUpperCase();
    const rows: any[] = await this.settings
      .find(filter)
      .select(publicOnly ? '-createdBy -updatedBy' : '')
      .sort({ group: 1, sortOrder: 1, key: 1 })
      .lean();
    if (!publicOnly) return { data: rows };
    const data = rows.reduce((result: any, row: any) => {
      if (!result[row.group]) result[row.group] = {};
      result[row.group][row.key] = row.type === WebsiteSettingType.JSON
        ? JSON.parse(row.value)
        : row.value;
      return result;
    }, {});
    return { data };
  }

  async settingDetail(id: string): Promise<any> {
    const doc = await this.settings.findOne({ _id: id, isDeleted: false }).lean();
    if (!doc) throw new NotFoundException('Không tìm thấy cấu hình website');
    return { data: doc };
  }

  async removeSetting(id: string, actorId: string): Promise<any> {
    const doc = await this.settings.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy cấu hình website');
    return { data: { id, deleted: true } };
  }
}
