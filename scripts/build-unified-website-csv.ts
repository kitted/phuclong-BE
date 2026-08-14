import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { writeToString } from '@fast-csv/format';
import { parseString as parseCsv } from '@fast-csv/parse';

type Row = Record<string, string>;

function readCsv(path: string): Promise<Row[]> {
  const source = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  return new Promise((resolve, reject) => {
    const rows: Row[] = [];
    parseCsv(source, { headers: true, ignoreEmpty: true, trim: true })
      .on('error', reject)
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows));
  });
}

function productKey(row: Row): string {
  const slug = String(row.slug || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `PRODUCT:${row.category_id}:${row.id}:${slug}`;
}

function categoryKey(row: Row): string {
  return `CATEGORY:${row.id}:${String(row.slug || '').toLowerCase()}`;
}

async function main() {
  const input = '/Users/kitzten/Downloads';
  const [categories, products, images, news] = await Promise.all([
    readCsv(`${input}/categories.csv`),
    readCsv(`${input}/products.csv`),
    readCsv(`${input}/product_images.csv`),
    readCsv(`${input}/news.csv`),
  ]);

  const slugCounts = new Map<string, number>();
  products.forEach((row) => {
    const slug = String(row.slug || '').toLowerCase();
    slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
  });
  products.forEach((row) => {
    const slug = String(row.slug || '').toLowerCase();
    row.slug = (slugCounts.get(slug) || 0) > 1 ? `${slug}-${row.id}` : slug;
  });

  const productsByLegacyId = new Map<string, Row[]>();
  products.forEach((row) => productsByLegacyId.set(row.id, [...(productsByLegacyId.get(row.id) || []), row]));
  const categoriesByLegacyId = new Map<string, Row[]>();
  categories.forEach((row) => categoriesByLegacyId.set(row.id, [...(categoriesByLegacyId.get(row.id) || []), row]));
  const productCategory = (product: Row): Row | undefined => {
    const candidates = categoriesByLegacyId.get(product.category_id) || [];
    const urlPrefix = String(product.url || '').split('/')[0].toLowerCase();
    return candidates.find((category) => String(category.slug || '').toLowerCase() === urlPrefix) || candidates[0];
  };
  const imageOccurrence = new Map<string, number>();
  let activeSegmentById = new Map<string, number>();

  const rows: Row[] = [];
  categories.forEach((row) => rows.push({
    record_type: 'CATEGORY', record_key: categoryKey(row), parent_key: '', legacy_id: row.id,
    category_legacy_id: '', product_legacy_id: '', name: row.name, title: '', slug: row.slug,
    code: '', url: '', short_description: '', description_html: row.description, price: '', price_status: '',
    stock_label: '', image_url: row.image_url, sort_order: '', is_primary: '', tags_json: '', specs_json: '',
    types_json: '', published_at: '', author: '', views: '', origin: '', banner_title: '',
    banner_description_json: '', content_json: '', status: row.status,
  }));

  products.forEach((row) => rows.push({
    record_type: 'PRODUCT', record_key: productKey(row), parent_key: productCategory(row) ? categoryKey(productCategory(row)!) : '',
    legacy_id: row.id, category_legacy_id: row.category_id, product_legacy_id: row.id, name: row.name,
    title: '', slug: row.slug, code: `WEB-${row.category_id}-${row.id}-${String(row.slug).toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`,
    url: row.url, short_description: row.short_description, description_html: row.description_html,
    price: row.price, price_status: row.price_status, stock_label: row.stock_label, image_url: row.image_url,
    sort_order: '', is_primary: '', tags_json: row.tags_json, specs_json: row.specs_json, types_json: '',
    published_at: '', author: '', views: '', origin: '', banner_title: '', banner_description_json: '',
    content_json: '', status: row.status,
  }));

  images.forEach((row, imageIndex) => {
    const id = row.product_id;
    if (row.is_primary === 'true' || Number(row.sort_order) === 1) {
      const next = imageOccurrence.get(id) || 0;
      activeSegmentById.set(id, next);
      imageOccurrence.set(id, next + 1);
    }
    const candidates = productsByLegacyId.get(id) || [];
    const occurrence = activeSegmentById.get(id) || 0;
    const product = candidates[Math.min(occurrence, Math.max(0, candidates.length - 1))];
    rows.push({
      record_type: 'PRODUCT_IMAGE', record_key: `IMAGE:${product ? productKey(product) : `UNKNOWN:${id}`}:${row.sort_order}:${imageIndex + 1}`,
      parent_key: product ? productKey(product) : '', legacy_id: '', category_legacy_id: product?.category_id || '',
      product_legacy_id: id, name: '', title: '', slug: '', code: '', url: '', short_description: '',
      description_html: '', price: '', price_status: '', stock_label: '', image_url: row.image_url,
      sort_order: row.sort_order, is_primary: row.is_primary, tags_json: '', specs_json: '', types_json: '',
      published_at: '', author: '', views: '', origin: '', banner_title: '', banner_description_json: '',
      content_json: '', status: 'active',
    });
  });

  news.forEach((row) => rows.push({
    record_type: 'NEWS', record_key: `NEWS:${row.id}`, parent_key: '', legacy_id: row.id,
    category_legacy_id: '', product_legacy_id: '', name: '', title: row.title, slug: `tin-${row.id}`,
    code: '', url: '', short_description: '', description_html: '', price: '', price_status: '', stock_label: '',
    image_url: row.banner_image, sort_order: '', is_primary: '', tags_json: row.tags_json,
    specs_json: '', types_json: row.types_json, published_at: row.published_at, author: row.author,
    views: row.views, origin: row.origin, banner_title: row.banner_title,
    banner_description_json: row.banner_description_json, content_json: row.content_json, status: row.status,
  }));

  const outputDir = '/Users/kitzten/Documents/project/phuclong-BE/outputs/website-data';
  mkdirSync(outputDir, { recursive: true });
  const outputPath = `${outputDir}/website-data-all.csv`;
  const csv = await writeToString(rows, { headers: true, quoteColumns: true, quoteHeaders: true });
  writeFileSync(outputPath, `\uFEFF${csv}`, 'utf8');

  const keys = new Set(rows.map((row) => row.record_key));
  const duplicateKeys = rows.length - keys.size;
  const brokenParents = rows.filter((row) => row.parent_key && !keys.has(row.parent_key));
  console.log(JSON.stringify({ outputPath, totalRows: rows.length, categories: categories.length, products: products.length, productImages: images.length, news: news.length, duplicateKeys, brokenParents: brokenParents.length }, null, 2));
  if (duplicateKeys || brokenParents.length) process.exitCode = 2;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
