import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import * as ExcelJS from 'exceljs';
import { parseString } from '@fast-csv/parse';
import { AppModule } from '../src/app.module';
import { WebsiteDataImportService } from '../src/collection/website-contents/website-data-import.service';
import { getConnectionToken, getModelToken } from 'nestjs-typegoose';
import { Products } from '../src/collection/products/schemas/products.schema';
import { Categories } from '../src/collection/categories/schemas/categories.schema';

type Row = Record<string, string>;

function csv(path: string): Promise<Row[]> {
  const source = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  return new Promise((resolve, reject) => {
    const rows: Row[] = [];
    parseString(source, { headers: true, ignoreEmpty: true, trim: true })
      .on('error', reject)
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows));
  });
}

function json(value: string, fallback: any): any {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function htmlEscape(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function newsHtml(row: Row): string {
  const blocks: any[] = json(row.content_json, []);
  const intro: string[] = json(row.banner_description_json, []);
  const output = intro.map((text) => `<p>${htmlEscape(text)}</p>`);
  for (const block of blocks) {
    if (block.title) output.push(`<h2>${htmlEscape(block.title)}</h2>`);
    if (block.text) output.push(`<p>${htmlEscape(block.text)}</p>`);
    if (block.image?.img) output.push(`<figure><img src="${htmlEscape(block.image.img)}" alt="${htmlEscape(block.image.title || '')}">${block.image.title ? `<figcaption>${htmlEscape(block.image.title)}</figcaption>` : ''}</figure>`);
    if (Array.isArray(block.images)) {
      for (const image of block.images) if (image.src) output.push(`<img src="${htmlEscape(image.src)}" alt="">`);
      if (block.caption) output.push(`<p>${htmlEscape(block.caption)}</p>`);
    }
  }
  return output.join('\n');
}

async function main() {
  const [categories, products, images, news] = await Promise.all([
    csv('/Users/kitzten/Downloads/categories.csv'),
    csv('/Users/kitzten/Downloads/products.csv'),
    csv('/Users/kitzten/Downloads/product_images.csv'),
    csv('/Users/kitzten/Downloads/news.csv'),
  ]);
  const imageSegments = new Map<string, Row[][]>();
  for (const image of images) {
    const segments = imageSegments.get(image.product_id) || [];
    if (!segments.length || image.is_primary === 'true' || Number(image.sort_order) === 1)
      segments.push([]);
    segments[segments.length - 1].push(image);
    imageSegments.set(image.product_id, segments);
  }
  for (const segments of imageSegments.values())
    for (const list of segments) list.sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  const categoryMap = new Map(categories.map((row) => [row.id, row]));
  const productOccurrences = new Map<string, number>();
  const slugCounts = new Map<string, number>();
  products.forEach((row) => {
    const slug = String(row.slug || '').toLowerCase();
    slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
  });

  const book = new ExcelJS.Workbook();
  const add = (name: string, headers: string[]) => {
    const sheet = book.addWorksheet(name);
    sheet.addRow(headers);
    return sheet;
  };
  const categorySheet = add('Danh muc san pham', ['Tên danh mục', 'Slug', 'Mô tả', 'Ảnh', 'Hiển thị']);
  categories.forEach((row) => categorySheet.addRow([row.name, row.slug, row.description, row.image_url, row.status === 'active']));
  const productSheet = add('San pham', ['Mã sản phẩm', 'Tên sản phẩm', 'Danh mục', 'Đơn vị', 'Giá bán', 'Slug', 'Mô tả ngắn', 'Nội dung HTML', 'Ảnh', 'Hiển thị']);
  products.forEach((row) => {
    const occurrence = productOccurrences.get(row.id) || 0;
    productOccurrences.set(row.id, occurrence + 1);
    const urls = (imageSegments.get(row.id)?.[occurrence] || []).map((image) => image.image_url);
    if (row.image_url && !urls.includes(row.image_url)) urls.unshift(row.image_url);
    const baseSlug = String(row.slug || '').toLowerCase();
    const uniqueSlug = (slugCounts.get(baseSlug) || 0) > 1 ? `${baseSlug}-${row.id}` : baseSlug;
    const codeSlug = uniqueSlug.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase();
    productSheet.addRow([`WEB-${row.category_id}-${row.id}-${codeSlug}`, row.name, categoryMap.get(row.category_id)?.name || '', '', Number(row.price || 0), uniqueSlug, row.short_description, row.description_html, urls.join('|'), row.status === 'active']);
  });
  const contentCategorySheet = add('Danh muc noi dung', ['Tên danh mục', 'Slug', 'Mô tả', 'Ảnh', 'Hoạt động', 'Thứ tự']);
  contentCategorySheet.addRow(['Tin tức', 'tin-tuc', 'Tin tức từ website cũ', '', true, 1]);
  const contentSheet = add('Noi dung', ['Tiêu đề', 'Slug', 'Loại', 'Slug danh mục', 'Mô tả ngắn', 'Nội dung HTML', 'Ảnh đại diện', 'Hashtag', 'Trạng thái', 'Yêu cầu xác minh']);
  news.forEach((row) => contentSheet.addRow([row.title, `tin-${row.id}`, 'NEWS', 'tin-tuc', String(json(row.banner_description_json, [])[0] || row.banner_title || ''), newsHtml(row), row.banner_image, json(row.tags_json, []).join(','), row.status === 'published' ? 'PUBLISHED' : 'DRAFT', false]));
  add('Cau hinh', ['Khóa', 'Tên hiển thị', 'Nhóm', 'Loại', 'Giá trị', 'Công khai', 'Hoạt động', 'Thứ tự']);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  const file = { buffer, size: buffer.length, originalname: 'legacy-website-data.xlsx' };

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const service = app.get(WebsiteDataImportService);
    const preview: any = await service.preview(file);
    console.log(JSON.stringify(preview, null, 2));
    if (!preview.data.canImport) process.exitCode = 2;
    else {
      console.log(JSON.stringify(await service.apply(file, 'LEGACY_WEBSITE_IMPORT'), null, 2));
      const coreProducts: any = app.get(getModelToken(Products.name));
      const coreCategories: any = app.get(getModelToken(Categories.name));
      const connection: any = app.get(getConnectionToken());
      const session = await connection.startSession();
      try {
        await session.withTransaction(async () => {
          const importedCoreProducts: any[] = await coreProducts
            .find({ code: /^WEB-/, isDeleted: false })
            .select('_id categoryId')
            .session(session)
            .lean();
          const categoryIds = [...new Set(importedCoreProducts.map((row) => row.categoryId && String(row.categoryId)).filter(Boolean))];
          await coreProducts.updateMany(
            { code: /^WEB-/, isDeleted: false },
            { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: 'WEBSITE_DATA_SEPARATION' } },
            { session },
          );
          for (const categoryId of categoryIds) {
            const used = await coreProducts.exists({ categoryId, isDeleted: false }).session(session);
            if (!used)
              await coreCategories.updateOne(
                { _id: categoryId, isDeleted: false },
                { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: 'WEBSITE_DATA_SEPARATION' } },
                { session },
              );
          }
          await coreProducts.collection.updateMany(
            { code: /^WEB-/ },
            { $unset: { slug: '', shortDescription: '', descriptionHtml: '', imageUrls: '', websiteVisible: '' } },
            { session },
          );
          await coreCategories.collection.updateMany(
            { _id: { $in: categoryIds.map((id) => new (require('mongoose').Types.ObjectId)(id)) } },
            { $unset: { slug: '', description: '', imageUrl: '', websiteVisible: '' } },
            { session },
          );
          console.log(JSON.stringify({ data: { separatedFromBo: true, productsRemovedFromBo: importedCoreProducts.length } }, null, 2));
        });
      } finally {
        await session.endSession();
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error?.response || error);
  process.exitCode = 1;
});
