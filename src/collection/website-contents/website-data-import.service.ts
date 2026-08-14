import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Connection } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { parseString as parseCsv } from '@fast-csv/parse';
import { WebsiteProductCategories, WebsiteProducts } from '../website-orders/schemas/website-products.schema';
import { WebsiteContentCategories } from './schemas/website-content-categories.schema';
import { WebsiteContents, WebsiteContentStatus, WebsiteContentType } from './schemas/website-contents.schema';
import { WebsiteSettings, WebsiteSettingType } from './schemas/website-settings.schema';

type ImportError = { sheet: string; row: number; field?: string; message: string };
type ImportPlan = {
  productCategories: any[];
  products: any[];
  contentCategories: any[];
  contents: any[];
  settings: any[];
  errors: ImportError[];
};

@Injectable()
export class WebsiteDataImportService {
  constructor(
    @InjectModel(WebsiteProducts) private readonly products: ReturnModelType<typeof WebsiteProducts>,
    @InjectModel(WebsiteProductCategories) private readonly productCategories: ReturnModelType<typeof WebsiteProductCategories>,
    @InjectModel(WebsiteContentCategories) private readonly contentCategories: ReturnModelType<typeof WebsiteContentCategories>,
    @InjectModel(WebsiteContents) private readonly contents: ReturnModelType<typeof WebsiteContents>,
    @InjectModel(WebsiteSettings) private readonly settings: ReturnModelType<typeof WebsiteSettings>,
    @Inject(getConnectionToken()) private readonly connection: Connection,
  ) {}

  private text(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      if (value.text !== undefined) return String(value.text).trim();
      if (value.result !== undefined) return String(value.result).trim();
      if (value.hyperlink !== undefined) return String(value.text || value.hyperlink).trim();
      if (Array.isArray(value.richText)) return value.richText.map((x: any) => x.text || '').join('').trim();
    }
    return String(value).trim();
  }

  private slug(value: any): string {
    return this.text(value).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private sanitize(html: string): string {
    return String(html || '')
      .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript\s*:/gi, '');
  }

  private bool(value: any, fallback = true): boolean | null {
    const text = this.text(value).toLowerCase();
    if (!text) return fallback;
    if (['true', '1', 'yes', 'co', 'có', 'x'].includes(text)) return true;
    if (['false', '0', 'no', 'khong', 'không'].includes(text)) return false;
    return null;
  }

  private number(value: any, fallback = 0): number | null {
    if (value === '' || value === null || value === undefined) return fallback;
    const parsed = typeof value === 'number' ? value : Number(this.text(value).replace(/,/g, ''));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  private rows(sheet?: ExcelJS.Worksheet): Array<{ row: number; data: Record<string, any> }> {
    if (!sheet) return [];
    const headers = new Map<number, string>();
    sheet.getRow(1).eachCell((cell, column) => headers.set(column, this.text(cell.value).toLocaleLowerCase('vi')));
    const rows: Array<{ row: number; data: Record<string, any> }> = [];
    for (let index = 2; index <= sheet.rowCount; index++) {
      const data: Record<string, any> = {};
      headers.forEach((header, column) => { data[header] = sheet.getRow(index).getCell(column).value; });
      if (Object.values(data).some((value) => this.text(value))) rows.push({ row: index, data });
    }
    return rows;
  }

  private value(data: Record<string, any>, ...names: string[]): any {
    for (const name of names) {
      const key = name.toLocaleLowerCase('vi');
      if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
    }
    return undefined;
  }

  private latestRows(items: any[], keys: string[]): any[] {
    const seen = new Map<string, Set<string>>(
      keys.map((key) => [key, new Set<string>()]),
    );
    const kept: any[] = [];
    for (let index = items.length - 1; index >= 0; index--) {
      const item = items[index];
      const values = keys
        .map((key) => ({
          key,
          value: String(item[key] || '').trim().toLocaleLowerCase('vi'),
        }))
        .filter(({ value }) => Boolean(value));
      if (values.some(({ key, value }) => seen.get(key)!.has(value))) continue;
      values.forEach(({ key, value }) => seen.get(key)!.add(value));
      kept.push(item);
    }
    return kept.reverse();
  }

  private async workbook(file: any): Promise<ExcelJS.Workbook> {
    if (!file?.buffer) throw new BadRequestException('Vui lòng tải lên file Excel');
    if (file.size > 15 * 1024 * 1024) throw new BadRequestException('File Excel không được vượt quá 15MB');
    const name = String(file.originalname || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv'))
      throw new BadRequestException('Chỉ hỗ trợ file .xlsx hoặc .csv');
    if (name.endsWith('.csv')) return this.unifiedCsvWorkbook(file.buffer);
    const book = new ExcelJS.Workbook();
    try { await book.xlsx.load(file.buffer); } catch { throw new BadRequestException('File Excel không hợp lệ hoặc bị hỏng'); }
    return book;
  }

  private csvRows(buffer: Buffer): Promise<Record<string, string>[]> {
    const source = buffer.toString('utf8').replace(/^\uFEFF/, '');
    return new Promise((resolve, reject) => {
      const rows: Record<string, string>[] = [];
      parseCsv(source, { headers: true, ignoreEmpty: true, trim: true })
        .on('error', reject)
        .on('data', (row) => rows.push(row))
        .on('end', () => resolve(rows));
    });
  }

  private json(value: string, fallback: any): any {
    try { return JSON.parse(value || ''); } catch { return fallback; }
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private legacyNewsHtml(row: Record<string, string>): string {
    const output: string[] = this.json(row.banner_description_json, [])
      .map((text: string) => `<p>${this.escapeHtml(text)}</p>`);
    for (const block of this.json(row.content_json, [])) {
      if (block.title) output.push(`<h2>${this.escapeHtml(block.title)}</h2>`);
      if (block.text) output.push(`<p>${this.escapeHtml(block.text)}</p>`);
      if (block.image?.img)
        output.push(`<figure><img src="${this.escapeHtml(block.image.img)}" alt="${this.escapeHtml(block.image.title || '')}">${block.image.title ? `<figcaption>${this.escapeHtml(block.image.title)}</figcaption>` : ''}</figure>`);
      if (Array.isArray(block.images)) {
        for (const image of block.images)
          if (image.src) output.push(`<img src="${this.escapeHtml(image.src)}" alt="">`);
        if (block.caption) output.push(`<p>${this.escapeHtml(block.caption)}</p>`);
      }
    }
    return output.join('\n');
  }

  private async unifiedCsvWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    let rows: Record<string, string>[];
    try { rows = await this.csvRows(buffer); }
    catch { throw new BadRequestException('File CSV không hợp lệ hoặc bị hỏng'); }
    if (!rows.length || !Object.prototype.hasOwnProperty.call(rows[0], 'record_type'))
      throw new BadRequestException('CSV phải là file hợp nhất có cột record_type');
    const supported = new Set(['CATEGORY', 'PRODUCT', 'PRODUCT_IMAGE', 'NEWS']);
    const unknown = [...new Set(rows.map((row) => row.record_type).filter((type) => !supported.has(type)))];
    if (unknown.length)
      throw new BadRequestException({ code: 'UNSUPPORTED_WEBSITE_RECORD_TYPE', message: 'CSV có record_type không được hỗ trợ', recordTypes: unknown });

    const book = new ExcelJS.Workbook();
    const add = (name: string, headers: string[]) => {
      const sheet = book.addWorksheet(name);
      sheet.addRow(headers);
      return sheet;
    };
    const categories = rows.filter((row) => row.record_type === 'CATEGORY');
    const products = rows.filter((row) => row.record_type === 'PRODUCT');
    const images = rows.filter((row) => row.record_type === 'PRODUCT_IMAGE');
    const news = rows.filter((row) => row.record_type === 'NEWS');
    const categoryByKey = new Map(categories.map((row) => [row.record_key, row]));
    const imagesByProductKey = new Map<string, Record<string, string>[]>();
    images.forEach((row) => imagesByProductKey.set(row.parent_key, [...(imagesByProductKey.get(row.parent_key) || []), row]));
    for (const list of imagesByProductKey.values()) list.sort((a, b) => Number(a.sort_order) - Number(b.sort_order));

    const categorySheet = add('Danh muc san pham', ['Tên danh mục', 'Slug', 'Mô tả', 'Ảnh', 'Hiển thị']);
    categories.forEach((row) => categorySheet.addRow([row.name, row.slug, row.description_html, row.image_url, String(row.status).toLowerCase() === 'active']));
    const productSheet = add('San pham', ['Mã sản phẩm', 'Tên sản phẩm', 'Danh mục', 'Đơn vị', 'Giá bán', 'Slug', 'Mô tả ngắn', 'Nội dung HTML', 'Ảnh', 'Hiển thị']);
    products.forEach((row) => {
      const urls = (imagesByProductKey.get(row.record_key) || []).map((image) => image.image_url).filter(Boolean);
      if (row.image_url && !urls.includes(row.image_url)) urls.unshift(row.image_url);
      productSheet.addRow([row.code, row.name, categoryByKey.get(row.parent_key)?.name || '', '', Number(row.price || 0), row.slug, row.short_description, row.description_html, urls.join('|'), String(row.status).toLowerCase() === 'active']);
    });
    const contentCategorySheet = add('Danh muc noi dung', ['Tên danh mục', 'Slug', 'Mô tả', 'Ảnh', 'Hoạt động', 'Thứ tự']);
    if (news.length) contentCategorySheet.addRow(['Tin tức', 'tin-tuc', 'Tin tức từ website cũ', '', true, 1]);
    const contentSheet = add('Noi dung', ['Tiêu đề', 'Slug', 'Loại', 'Slug danh mục', 'Mô tả ngắn', 'Nội dung HTML', 'Ảnh đại diện', 'Hashtag', 'Trạng thái', 'Yêu cầu xác minh']);
    news.forEach((row) => contentSheet.addRow([row.title, row.slug || `tin-${row.legacy_id}`, 'NEWS', 'tin-tuc', String(this.json(row.banner_description_json, [])[0] || row.banner_title || ''), this.legacyNewsHtml(row), row.image_url, this.json(row.tags_json, []).join(','), String(row.status).toLowerCase() === 'published' ? 'PUBLISHED' : 'DRAFT', false]));
    add('Cau hinh', ['Khóa', 'Tên hiển thị', 'Nhóm', 'Loại', 'Giá trị', 'Công khai', 'Hoạt động', 'Thứ tự']);
    return book;
  }

  private async plan(file: any): Promise<ImportPlan> {
    const book = await this.workbook(file), errors: ImportError[] = [];
    let productCategories = this.rows(book.getWorksheet('Danh muc san pham')).map(({ row, data }) => ({
      __row: row,
      name: this.text(this.value(data, 'Tên danh mục', 'name')),
      slug: this.slug(this.value(data, 'Slug')),
      description: this.text(this.value(data, 'Mô tả', 'description')),
      imageUrl: this.text(this.value(data, 'Ảnh', 'imageUrl')),
      websiteVisible: this.bool(this.value(data, 'Hiển thị', 'websiteVisible')),
    }));
    productCategories = this.latestRows(productCategories, ['name', 'slug']);
    productCategories.forEach((x) => {
      if (!x.name) errors.push({ sheet: 'Danh muc san pham', row: x.__row, field: 'name', message: 'Thiếu tên danh mục' });
      if (x.websiteVisible === null) errors.push({ sheet: 'Danh muc san pham', row: x.__row, field: 'websiteVisible', message: 'Hiển thị phải là TRUE hoặc FALSE' });
    });

    let products = this.rows(book.getWorksheet('San pham')).map(({ row, data }) => ({
      __row: row,
      code: this.text(this.value(data, 'Mã sản phẩm', 'code')).toUpperCase().replace(/\s+/g, ''),
      name: this.text(this.value(data, 'Tên sản phẩm', 'name')),
      categoryName: this.text(this.value(data, 'Danh mục', 'category')),
      unit: this.text(this.value(data, 'Đơn vị', 'unit')),
      sellPrice: this.number(this.value(data, 'Giá bán', 'sellPrice')),
      slug: this.slug(this.value(data, 'Slug')),
      shortDescription: this.text(this.value(data, 'Mô tả ngắn', 'shortDescription')),
      descriptionHtml: this.sanitize(this.text(this.value(data, 'Nội dung HTML', 'descriptionHtml'))),
      // Cloudinary transformations contain commas (for example
      // c_crop,w_1100,h_1100), so comma must never be treated as an image
      // separator. Use a pipe or a new line between URLs.
      imageUrls: this.text(this.value(data, 'Ảnh', 'imageUrls')).split(/[\n|]+/).map((x) => x.trim()).filter(Boolean),
      websiteVisible: this.bool(this.value(data, 'Hiển thị', 'websiteVisible')),
    }));
    products = this.latestRows(products, ['code', 'slug']);
    products.forEach((x) => {
      if (!x.code) errors.push({ sheet: 'San pham', row: x.__row, field: 'code', message: 'Thiếu mã sản phẩm' });
      if (!x.name) errors.push({ sheet: 'San pham', row: x.__row, field: 'name', message: 'Thiếu tên sản phẩm' });
      if (x.sellPrice === null) errors.push({ sheet: 'San pham', row: x.__row, field: 'sellPrice', message: 'Giá bán phải là số không âm' });
      if (x.websiteVisible === null) errors.push({ sheet: 'San pham', row: x.__row, field: 'websiteVisible', message: 'Hiển thị phải là TRUE hoặc FALSE' });
    });

    let contentCategories = this.rows(book.getWorksheet('Danh muc noi dung')).map(({ row, data }) => ({
      __row: row,
      name: this.text(this.value(data, 'Tên danh mục', 'name')),
      slug: this.slug(this.value(data, 'Slug')),
      description: this.text(this.value(data, 'Mô tả', 'description')),
      imageUrl: this.text(this.value(data, 'Ảnh', 'imageUrl')),
      isActive: this.bool(this.value(data, 'Hoạt động', 'isActive')),
      sortOrder: this.number(this.value(data, 'Thứ tự', 'sortOrder')),
    }));
    contentCategories = this.latestRows(contentCategories, ['slug']);
    contentCategories.forEach((x) => {
      if (!x.name || !x.slug) errors.push({ sheet: 'Danh muc noi dung', row: x.__row, message: 'Thiếu tên hoặc slug danh mục' });
      if (x.isActive === null || x.sortOrder === null) errors.push({ sheet: 'Danh muc noi dung', row: x.__row, message: 'Trạng thái hoặc thứ tự không hợp lệ' });
    });

    let contents = this.rows(book.getWorksheet('Noi dung')).map(({ row, data }) => ({
      __row: row,
      title: this.text(this.value(data, 'Tiêu đề', 'title')),
      slug: this.slug(this.value(data, 'Slug')),
      type: this.text(this.value(data, 'Loại', 'type')).toUpperCase(),
      categorySlug: this.slug(this.value(data, 'Slug danh mục', 'categorySlug')),
      excerpt: this.text(this.value(data, 'Mô tả ngắn', 'excerpt')),
      contentHtml: this.sanitize(this.text(this.value(data, 'Nội dung HTML', 'contentHtml'))),
      coverImageUrl: this.text(this.value(data, 'Ảnh đại diện', 'coverImageUrl')),
      hashtags: this.text(this.value(data, 'Hashtag', 'hashtags')).split(/[,|\n]+/).map((x) => x.trim().replace(/^#/, '')).filter(Boolean),
      status: this.text(this.value(data, 'Trạng thái', 'status')).toUpperCase() || WebsiteContentStatus.DRAFT,
      requiresCustomerVerification: this.bool(this.value(data, 'Yêu cầu xác minh', 'requiresCustomerVerification'), false),
    }));
    contents = this.latestRows(contents, ['slug']);
    contents.forEach((x) => {
      if (!x.title || !x.slug || !x.contentHtml) errors.push({ sheet: 'Noi dung', row: x.__row, message: 'Thiếu tiêu đề, slug hoặc nội dung HTML' });
      if (!Object.values(WebsiteContentType).includes(x.type as WebsiteContentType)) errors.push({ sheet: 'Noi dung', row: x.__row, field: 'type', message: 'Loại nội dung không hợp lệ' });
      if (!Object.values(WebsiteContentStatus).includes(x.status as WebsiteContentStatus)) errors.push({ sheet: 'Noi dung', row: x.__row, field: 'status', message: 'Trạng thái không hợp lệ' });
      if (x.requiresCustomerVerification === null) errors.push({ sheet: 'Noi dung', row: x.__row, field: 'requiresCustomerVerification', message: 'Yêu cầu xác minh phải là TRUE hoặc FALSE' });
    });

    let settings = this.rows(book.getWorksheet('Cau hinh')).map(({ row, data }) => ({
      __row: row,
      key: this.text(this.value(data, 'Khóa', 'key')).toUpperCase(),
      label: this.text(this.value(data, 'Tên hiển thị', 'label')),
      group: this.text(this.value(data, 'Nhóm', 'group')).toUpperCase(),
      type: this.text(this.value(data, 'Loại', 'type')).toUpperCase(),
      value: this.text(this.value(data, 'Giá trị', 'value')),
      isPublic: this.bool(this.value(data, 'Công khai', 'isPublic')),
      isActive: this.bool(this.value(data, 'Hoạt động', 'isActive')),
      sortOrder: this.number(this.value(data, 'Thứ tự', 'sortOrder')),
    }));
    settings = this.latestRows(settings, ['key']);
    settings.forEach((x) => {
      if (!x.key || !x.label || !x.group) errors.push({ sheet: 'Cau hinh', row: x.__row, message: 'Thiếu khóa, tên hiển thị hoặc nhóm' });
      if (!Object.values(WebsiteSettingType).includes(x.type as WebsiteSettingType)) errors.push({ sheet: 'Cau hinh', row: x.__row, field: 'type', message: 'Loại cấu hình không hợp lệ' });
      if (x.type === WebsiteSettingType.JSON) { try { JSON.parse(x.value); } catch { errors.push({ sheet: 'Cau hinh', row: x.__row, field: 'value', message: 'JSON không hợp lệ' }); } }
      if (x.isPublic === null || x.isActive === null || x.sortOrder === null) errors.push({ sheet: 'Cau hinh', row: x.__row, message: 'Trạng thái hoặc thứ tự không hợp lệ' });
    });

    const requestedCategorySlugs = [...new Set(contents.map((x) => x.categorySlug).filter(Boolean))];
    const categorySlugsInFile = new Set(contentCategories.map((x) => x.slug));
    const categorySlugsInDatabase = requestedCategorySlugs.length
      ? new Set((await this.contentCategories.find({ slug: { $in: requestedCategorySlugs }, isDeleted: false }).select('slug').lean()).map((x: any) => x.slug))
      : new Set<string>();
    contents.forEach((x) => {
      if (x.categorySlug && !categorySlugsInFile.has(x.categorySlug) && !categorySlugsInDatabase.has(x.categorySlug))
        errors.push({ sheet: 'Noi dung', row: x.__row, field: 'categorySlug', message: `Không tìm thấy danh mục nội dung ${x.categorySlug}` });
    });

    return { productCategories, products, contentCategories, contents, settings, errors };
  }

  async preview(file: any): Promise<any> {
    const plan = await this.plan(file);
    return { data: { canImport: plan.errors.length === 0, summary: this.summary(plan), errors: plan.errors } };
  }

  private summary(plan: ImportPlan): any {
    return {
      productCategories: plan.productCategories.length,
      products: plan.products.length,
      contentCategories: plan.contentCategories.length,
      contents: plan.contents.length,
      settings: plan.settings.length,
      errors: plan.errors.length,
    };
  }

  async apply(file: any, actorId: string): Promise<any> {
    const plan = await this.plan(file);
    if (plan.errors.length) throw new BadRequestException({ code: 'WEBSITE_IMPORT_INVALID', message: 'File import có dữ liệu không hợp lệ', errors: plan.errors });
    const session = await this.connection.startSession();
    const result = { productCategories: 0, products: 0, contentCategories: 0, contents: 0, settings: 0 };
    try {
      await session.withTransaction(async () => {
        for (const row of plan.productCategories) {
          await this.productCategories.findOneAndUpdate(
            { name: row.name },
            { $set: { name: row.name, slug: row.slug, description: row.description, imageUrl: row.imageUrl, isActive: row.websiteVisible, isDeleted: false, deletedAt: null } },
            { upsert: true, new: true, session },
          );
          result.productCategories++;
        }
        for (const row of plan.products) {
          let categoryId: any;
          if (row.categoryName) {
            const category: any = await this.productCategories.findOneAndUpdate(
              { name: row.categoryName },
              { $set: { name: row.categoryName, slug: this.slug(row.categoryName), isActive: true, isDeleted: false, deletedAt: null } },
              { upsert: true, new: true, session },
            );
            categoryId = category._id;
          }
          await this.products.findOneAndUpdate(
            { code: row.code },
            { $set: { code: row.code, name: row.name, categoryId: categoryId || null, unit: row.unit, sellPrice: row.sellPrice, slug: row.slug, shortDescription: row.shortDescription, descriptionHtml: row.descriptionHtml, imageUrls: row.imageUrls, isActive: row.websiteVisible, isDeleted: false, deletedAt: null } },
            { upsert: true, new: true, session },
          );
          result.products++;
        }
        const contentCategoryIds = new Map<string, string>();
        for (const row of plan.contentCategories) {
          const category: any = await this.contentCategories.findOneAndUpdate(
            { slug: row.slug },
            { $set: { name: row.name, slug: row.slug, description: row.description || undefined, imageUrl: row.imageUrl || undefined, isActive: row.isActive, sortOrder: row.sortOrder, updatedBy: actorId, isDeleted: false, deletedAt: null }, $setOnInsert: { createdBy: actorId } },
            { upsert: true, new: true, session },
          );
          contentCategoryIds.set(row.slug, String(category._id));
          result.contentCategories++;
        }
        for (const row of plan.contents) {
          let categoryId = row.categorySlug ? contentCategoryIds.get(row.categorySlug) : undefined;
          if (row.categorySlug && !categoryId) {
            const category: any = await this.contentCategories.findOne({ slug: row.categorySlug, isDeleted: false }).session(session).lean();
            if (!category) throw new BadRequestException(`Không tìm thấy danh mục nội dung ${row.categorySlug}`);
            categoryId = String(category._id);
          }
          await this.contents.findOneAndUpdate(
            { slug: row.slug },
            { $set: { title: row.title, slug: row.slug, type: row.type, categoryId: categoryId || null, excerpt: row.excerpt, contentHtml: row.contentHtml, coverImageUrl: row.coverImageUrl, hashtags: row.hashtags, status: row.status, requiresCustomerVerification: row.requiresCustomerVerification, publishedAt: row.status === WebsiteContentStatus.PUBLISHED ? new Date() : null, updatedBy: actorId, isDeleted: false, deletedAt: null }, $setOnInsert: { createdBy: actorId } },
            { upsert: true, new: true, session },
          );
          result.contents++;
        }
        for (const row of plan.settings) {
          await this.settings.findOneAndUpdate(
            { key: row.key },
            { $set: { key: row.key, label: row.label, group: row.group, type: row.type, value: row.value, isPublic: row.isPublic, isActive: row.isActive, sortOrder: row.sortOrder, updatedBy: actorId, isDeleted: false, deletedAt: null }, $setOnInsert: { createdBy: actorId } },
            { upsert: true, new: true, session },
          );
          result.settings++;
        }
      });
      return { data: { imported: true, summary: result } };
    } finally {
      await session.endSession();
    }
  }

  async template(): Promise<Buffer> {
    const book = new ExcelJS.Workbook();
    const add = (name: string, columns: Array<{ header: string; key: string; width?: number }>) => {
      const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = columns;
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
      sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };
      return sheet;
    };
    add('Danh muc san pham', [
      { header: 'Tên danh mục', key: 'name', width: 35 },
      { header: 'Slug', key: 'slug', width: 30 },
      { header: 'Mô tả', key: 'description', width: 45 },
      { header: 'Ảnh', key: 'imageUrl', width: 55 },
      { header: 'Hiển thị', key: 'websiteVisible', width: 14 },
    ]);
    add('San pham', [
      { header: 'Mã sản phẩm', key: 'code', width: 18 }, { header: 'Tên sản phẩm', key: 'name', width: 35 },
      { header: 'Danh mục', key: 'category', width: 28 }, { header: 'Đơn vị', key: 'unit', width: 12 },
      { header: 'Giá bán', key: 'sellPrice', width: 16 }, { header: 'Slug', key: 'slug', width: 30 },
      { header: 'Mô tả ngắn', key: 'shortDescription', width: 45 }, { header: 'Nội dung HTML', key: 'descriptionHtml', width: 60 },
      { header: 'Ảnh', key: 'imageUrls', width: 55 }, { header: 'Hiển thị', key: 'websiteVisible', width: 14 },
    ]);
    add('Danh muc noi dung', [
      { header: 'Tên danh mục', key: 'name', width: 30 }, { header: 'Slug', key: 'slug', width: 30 },
      { header: 'Mô tả', key: 'description', width: 45 }, { header: 'Ảnh', key: 'imageUrl', width: 50 },
      { header: 'Hoạt động', key: 'isActive', width: 14 }, { header: 'Thứ tự', key: 'sortOrder', width: 12 },
    ]);
    add('Noi dung', [
      { header: 'Tiêu đề', key: 'title', width: 40 }, { header: 'Slug', key: 'slug', width: 35 },
      { header: 'Loại', key: 'type', width: 16 }, { header: 'Slug danh mục', key: 'categorySlug', width: 28 },
      { header: 'Mô tả ngắn', key: 'excerpt', width: 45 }, { header: 'Nội dung HTML', key: 'contentHtml', width: 70 },
      { header: 'Ảnh đại diện', key: 'coverImageUrl', width: 50 }, { header: 'Hashtag', key: 'hashtags', width: 30 },
      { header: 'Trạng thái', key: 'status', width: 16 }, { header: 'Yêu cầu xác minh', key: 'requiresCustomerVerification', width: 20 },
    ]);
    add('Cau hinh', [
      { header: 'Khóa', key: 'key', width: 24 }, { header: 'Tên hiển thị', key: 'label', width: 30 },
      { header: 'Nhóm', key: 'group', width: 20 }, { header: 'Loại', key: 'type', width: 16 },
      { header: 'Giá trị', key: 'value', width: 70 }, { header: 'Công khai', key: 'isPublic', width: 14 },
      { header: 'Hoạt động', key: 'isActive', width: 14 }, { header: 'Thứ tự', key: 'sortOrder', width: 12 },
    ]);
    return Buffer.from(await book.xlsx.writeBuffer());
  }
}
