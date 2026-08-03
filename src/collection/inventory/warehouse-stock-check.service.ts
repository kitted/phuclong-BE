import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Connection } from 'mongoose';
import { createHash, randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import { Products } from '../products/schemas/products.schema';
import {
  WarehouseStockChecks,
  WarehouseStockCheckStatus,
} from './schemas/warehouse-stock-checks.schema';
import {
  WarehouseInventoryBackupCounters,
  WarehouseInventoryBackups,
  WarehouseInventoryBackupSource,
} from './schemas/warehouse-inventory-backups.schema';
import {
  InventoryMovements,
  InventoryLocationType,
  InventoryMovementType,
} from './schemas/inventory-movement.schema';
import { Users } from '../users/schemas/users.schema';
import {
  Notifications,
  NotificationType,
} from '../notifications/schemas/notifications.schema';
import {
  AuditLogs,
  AuditLogAction,
  AuditLogStatus,
} from '../audit-logs/schemas/audit-logs.schema';
import { normalizeExcelHeader } from '../../core/excel-import';
import {
  RestoreWarehouseStockDto,
  SyncWarehouseStockDto,
  WarehouseBackupQueryDto,
} from './dtos/warehouse-stock-check.dto';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';
@Injectable()
export class WarehouseStockCheckService {
  constructor(
    @InjectModel(Products) private products: ReturnModelType<typeof Products>,
    @InjectModel(WarehouseStockChecks)
    private checks: ReturnModelType<typeof WarehouseStockChecks>,
    @InjectModel(WarehouseInventoryBackups)
    private backups: ReturnModelType<typeof WarehouseInventoryBackups>,
    @InjectModel(WarehouseInventoryBackupCounters)
    private counters: ReturnModelType<typeof WarehouseInventoryBackupCounters>,
    @InjectModel(InventoryMovements)
    private movements: ReturnModelType<typeof InventoryMovements>,
    @InjectModel(Users) private users: ReturnModelType<typeof Users>,
    @InjectModel(Notifications)
    private notifications: ReturnModelType<typeof Notifications>,
    @InjectModel(AuditLogs) private audits: ReturnModelType<typeof AuditLogs>,
    @Inject(getConnectionToken()) private connection: Connection,
  ) {}
  private async activeProducts(session?: any) {
    const q = this.products
      .find({ isDeleted: false })
      .select('code name unit stock costPrice sellPrice')
      .sort({ code: 1, _id: 1 });
    if (session) return q.session(session);
    return q.lean();
  }
  async template(): Promise<Buffer> {
    const products: any[] = await this.activeProducts(),
      book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Kiểm hàng kho', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
    sheet.columns = [
      { header: 'STT', key: 'stt', width: 7 },
      { header: 'MÃ SẢN PHẨM', key: 'productCode', width: 20 },
      { header: 'TÊN SẢN PHẨM', key: 'productName', width: 36 },
      { header: 'ĐƠN VỊ', key: 'unit', width: 14 },
      { header: 'SỐ LƯỢNG TRÊN APP', key: 'systemQuantity', width: 22 },
      { header: 'SỐ LƯỢNG THỰC TẾ', key: 'actualQuantity', width: 22 },
      { header: 'GHI CHÚ', key: 'note', width: 36 },
    ];
    products.forEach((p: any, i: number) => {
      sheet.addRow({
        stt: i + 1,
        productCode: p.code,
        productName: p.name,
        unit: p.unit || '',
        systemQuantity: Number(p.stock || 0),
        actualQuantity: null,
        note: '',
      });
      sheet.getCell(`F${i + 2}`).dataValidation = {
        type: 'whole',
        operator: 'greaterThanOrEqual',
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Số lượng không hợp lệ',
        error: 'Chỉ nhập số nguyên lớn hơn hoặc bằng 0',
      };
    });
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1565C0' },
    };
    sheet.autoFilter = { from: 'A1', to: 'G1' };
    ['systemQuantity', 'actualQuantity'].forEach(
      (x) => (sheet.getColumn(x).numFmt = '0'),
    );
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  async compare(file: any, actorId?: string): Promise<any> {
    if (!file?.buffer)
      throw new BadRequestException('Vui lòng tải lên file Excel');
    if (file.size > 10 * 1024 * 1024)
      throw new BadRequestException('File Excel không được vượt quá 10MB');
    if (
      !String(file.originalname || '')
        .toLowerCase()
        .endsWith('.xlsx')
    )
      throw new BadRequestException('Chỉ hỗ trợ file .xlsx');
    const products: any[] = await this.activeProducts(),
      book = new ExcelJS.Workbook();
    try {
      await book.xlsx.load(file.buffer);
    } catch {
      throw new BadRequestException('File Excel không hợp lệ hoặc bị hỏng');
    }
    const sheet = book.worksheets[0];
    if (!sheet) throw new BadRequestException('File Excel không có worksheet');
    const headers = new Map<string, number>();
    sheet
      .getRow(1)
      .eachCell((cell, col) =>
        headers.set(normalizeExcelHeader(cell.value), col),
      );
    const codeCol = headers.get(normalizeExcelHeader('MÃ SẢN PHẨM')),
      actualCol = headers.get(normalizeExcelHeader('SỐ LƯỢNG THỰC TẾ')),
      noteCol = headers.get(normalizeExcelHeader('GHI CHÚ'));
    if (!codeCol || !actualCol)
      throw new BadRequestException(
        'File thiếu cột MÃ SẢN PHẨM hoặc SỐ LƯỢNG THỰC TẾ',
      );
    const rows: any[] = [];
    for (let n = 2; n <= sheet.rowCount; n++) {
      const row = sheet.getRow(n),
        code = String(row.getCell(codeCol).text || '')
          .trim()
          .toUpperCase();
      if (!code) continue;
      const cell = row.getCell(actualCol),
        raw = cell.value,
        blank =
          raw === null || raw === undefined || String(cell.text).trim() === '';
      rows.push({
        rowNumber: n,
        code,
        raw,
        blank,
        note: noteCol ? String(row.getCell(noteCol).text || '').trim() : '',
      });
    }
    const counts = new Map<string, number>();
    rows.forEach((x) => counts.set(x.code, (counts.get(x.code) || 0) + 1));
    const byCode = new Map(
        products.map((p) => [String(p.code).toUpperCase(), p]),
      ),
      seen = new Set<string>(),
      items: any[] = [];
    for (const row of rows) {
      seen.add(row.code);
      const p: any = byCode.get(row.code);
      let status: WarehouseStockCheckStatus,
        actualQuantity: number | undefined,
        differenceQuantity: number | undefined,
        note = row.note;
      if ((counts.get(row.code) || 0) > 1) {
        status = WarehouseStockCheckStatus.INVALID;
        note = note || 'Mã sản phẩm bị trùng nhiều dòng';
      } else if (!p) {
        status = WarehouseStockCheckStatus.UNKNOWN;
        note = note || 'Mã sản phẩm không tồn tại';
      } else if (row.blank) {
        status = WarehouseStockCheckStatus.NOT_COUNTED;
      } else if (
        typeof row.raw !== 'number' ||
        !Number.isInteger(row.raw) ||
        row.raw < 0
      ) {
        status = WarehouseStockCheckStatus.INVALID;
        note = note || 'Số lượng thực tế phải là số nguyên lớn hơn hoặc bằng 0';
      } else {
        actualQuantity = row.raw;
        differenceQuantity = actualQuantity - Number(p.stock || 0);
        status =
          differenceQuantity === 0
            ? WarehouseStockCheckStatus.MATCHED
            : differenceQuantity < 0
              ? WarehouseStockCheckStatus.SHORTAGE
              : WarehouseStockCheckStatus.SURPLUS;
      }
      items.push({
        productId: p ? String(p._id) : undefined,
        productCode: row.code,
        productName: p?.name || '',
        unit: p?.unit || '',
        systemQuantity: p ? Number(p.stock || 0) : undefined,
        actualQuantity,
        differenceQuantity,
        status,
        note,
        rowNumber: row.rowNumber,
      });
    }
    for (const p of products)
      if (!seen.has(String(p.code).toUpperCase()))
        items.push({
          productId: String(p._id),
          productCode: p.code,
          productName: p.name,
          unit: p.unit || '',
          systemQuantity: Number(p.stock || 0),
          status: WarehouseStockCheckStatus.NOT_COUNTED,
          note: 'Không có dòng đối chiếu trong file',
        });
    const summary = this.comparisonSummary(items),
      comparedAt = new Date(),
      doc: any = await this.checks.create({
        comparedAt,
        items,
        summary,
        createdBy: actorId,
        sourceFileName: file.originalname,
      });
    return {
      data: { comparisonId: String(doc._id), comparedAt, summary, items },
    };
  }
  private comparisonSummary(items: any[]) {
    return {
      totalProducts: items.filter((x) => x.productId).length,
      countedProducts: items.filter((x) =>
        [
          WarehouseStockCheckStatus.MATCHED,
          WarehouseStockCheckStatus.SHORTAGE,
          WarehouseStockCheckStatus.SURPLUS,
        ].includes(x.status),
      ).length,
      matchedProducts: items.filter(
        (x) => x.status === WarehouseStockCheckStatus.MATCHED,
      ).length,
      shortageProducts: items.filter(
        (x) => x.status === WarehouseStockCheckStatus.SHORTAGE,
      ).length,
      surplusProducts: items.filter(
        (x) => x.status === WarehouseStockCheckStatus.SURPLUS,
      ).length,
      notCountedProducts: items.filter(
        (x) => x.status === WarehouseStockCheckStatus.NOT_COUNTED,
      ).length,
      totalShortageQuantity: items
        .filter((x) => x.status === WarehouseStockCheckStatus.SHORTAGE)
        .reduce((s, x) => s + Math.abs(x.differenceQuantity || 0), 0),
      totalSurplusQuantity: items
        .filter((x) => x.status === WarehouseStockCheckStatus.SURPLUS)
        .reduce((s, x) => s + (x.differenceQuantity || 0), 0),
      unknownProducts: items.filter(
        (x) => x.status === WarehouseStockCheckStatus.UNKNOWN,
      ).length,
      invalidRows: items.filter(
        (x) => x.status === WarehouseStockCheckStatus.INVALID,
      ).length,
    };
  }
  private blockers(check: any) {
    return (check.items || [])
      .filter(
        (x: any) =>
          [
            WarehouseStockCheckStatus.NOT_COUNTED,
            WarehouseStockCheckStatus.UNKNOWN,
            WarehouseStockCheckStatus.INVALID,
          ].includes(x.status) ||
          !Number.isInteger(x.actualQuantity) ||
          x.actualQuantity < 0,
      )
      .map((x: any) => ({
        productCode: x.productCode,
        status: x.status,
        message: `${x.productCode || 'Dòng'} chưa đủ điều kiện đồng bộ`,
      }));
  }
  private stale(check: any, products: any[]) {
    const expected = new Map<string, number>(
        (check.items || [])
          .filter((x: any) => x.productId)
          .map((x: any) => [
            String(x.productId),
            Number(x.systemQuantity || 0),
          ]),
      ),
      current = new Map<string, number>(
        products.map((x: any) => [String(x._id), Number(x.stock || 0)]),
      ),
      ids = new Set([...expected.keys(), ...current.keys()]);
    return [...ids]
      .filter(
        (id) =>
          !expected.has(id) ||
          !current.has(id) ||
          (expected.get(id) || 0) !== (current.get(id) || 0),
      )
      .map((productId) => ({
        productId,
        systemQuantity: expected.get(productId),
        currentQuantity: current.get(productId),
        changeType: !expected.has(productId)
          ? 'PRODUCT_CREATED'
          : !current.has(productId)
            ? 'PRODUCT_REMOVED'
            : 'QUANTITY_CHANGED',
      }));
  }
  async syncPreview(id: string): Promise<any> {
    const check: any = await this.checks
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!check) throw new NotFoundException('Không tìm thấy kết quả đối chiếu');
    const products: any[] = await this.activeProducts(),
      blockers = this.blockers(check),
      changedProducts = this.stale(check, products);
    if (check.syncedAt)
      blockers.push({
        code: 'WAREHOUSE_STOCK_CHECK_ALREADY_SYNCED',
        message: 'Kết quả đã được đồng bộ',
      });
    if (changedProducts.length)
      blockers.push({
        code: 'WAREHOUSE_STOCK_CHECK_STALE',
        message: 'Tồn kho đã thay đổi sau khi đối chiếu',
        changedProducts,
      });
    return {
      data: {
        canSync: blockers.length === 0,
        summary: this.comparisonSummary(check.items || []),
        warnings: [],
        blockers,
      },
    };
  }
  private checksum(items: any[]) {
    return createHash('sha256')
      .update(
        JSON.stringify(
          items
            .map((x) => ({
              productId: String(x.productId),
              quantity: Number(x.quantity),
            }))
            .sort((a, b) => a.productId.localeCompare(b.productId)),
        ),
      )
      .digest('hex');
  }
  private async createBackup(
    sourceType: WarehouseInventoryBackupSource,
    reason: string,
    actor: any,
    session: any,
    stockCheckId?: string,
  ) {
    const products: any[] = await this.activeProducts(session),
      items = products.map((p) => ({
        productId: String(p._id),
        productCode: p.code,
        productName: p.name,
        unit: p.unit || '',
        quantity: Number(p.stock || 0),
        costPrice: Number(p.costPrice || 0),
        sellPrice: Number(p.sellPrice || 0),
      })),
      day = new Date()
        .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
        .replaceAll('-', ''),
      counter: any = await this.counters.findOneAndUpdate(
        { key: day },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true, session },
      ),
      code = `KHO-BK-${day.slice(2)}-${String(counter.sequence).padStart(4, '0')}`;
    return (
      await this.backups.create(
        [
          {
            code,
            sourceType,
            stockCheckId,
            items,
            totalProducts: items.length,
            totalQuantity: items.reduce((s, x) => s + x.quantity, 0),
            totalCostValue: items.reduce(
              (s, x) => s + x.quantity * x.costPrice,
              0,
            ),
            totalSellValue: items.reduce(
              (s, x) => s + x.quantity * x.sellPrice,
              0,
            ),
            checksum: this.checksum(items),
            reason,
            createdBy: String(actor?._id || ''),
            createdByName: actor?.fullName || actor?.username || '',
          },
        ],
        { session },
      )
    )[0];
  }
  private staleError(changedProducts: any[]): never {
    throw new ConflictException({
      code: 'WAREHOUSE_STOCK_CHECK_STALE',
      message: 'Tồn kho đã thay đổi sau khi đối chiếu, vui lòng kiểm tra lại',
      changedProducts,
    });
  }
  async sync(
    id: string,
    dto: SyncWarehouseStockDto,
    actorId: string,
  ): Promise<any> {
    if (
      dto.confirmation !== 'DONG BO TON KHO' ||
      !dto.reason?.trim() ||
      !dto.idempotencyKey?.trim()
    )
      throw new BadRequestException(
        'Thiếu lý do, xác nhận hoặc idempotencyKey',
      );
    const prior: any = await this.checks
      .findOne({ syncIdempotencyKey: dto.idempotencyKey })
      .lean();
    if (prior) return { data: prior, idempotent: true };
    const session = await this.connection.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const [check, actor]: any[] = await Promise.all([
          this.checks.findOne({ _id: id, isDeleted: false }).session(session),
          this.users.findById(actorId).session(session).lean(),
        ]);
        if (!check)
          throw new NotFoundException('Không tìm thấy kết quả đối chiếu');
        if (check.syncedAt)
          throw new ConflictException({
            code: 'WAREHOUSE_STOCK_CHECK_ALREADY_SYNCED',
            message: 'Kết quả đã được đồng bộ',
          });
        const blockers = this.blockers(check);
        if (blockers.length)
          throw new ConflictException({
            code: 'WAREHOUSE_STOCK_CHECK_BLOCKED',
            message: 'Kết quả chưa đủ điều kiện đồng bộ',
            blockers,
          });
        const products: any[] = await this.activeProducts(session),
          changed = this.stale(check, products);
        if (changed.length) this.staleError(changed);
        const backup: any = await this.createBackup(
            WarehouseInventoryBackupSource.STOCK_CHECK_SYNC,
            dto.reason.trim(),
            actor,
            session,
            String(check._id),
          ),
          byId = new Map(
            (check.items || []).map((x: any) => [
              String(x.productId),
              Number(x.actualQuantity),
            ]),
          ),
          movementRows: any[] = [];
        for (const product of products) {
          const before = Number(product.stock || 0),
            after = Number(byId.get(String(product._id)));
          if (before === after) continue;
          product.stock = after;
          await product.save({ session });
          const delta = after - before;
          movementRows.push({
            productId: product._id,
            type:
              delta > 0
                ? InventoryMovementType.WAREHOUSE_STOCK_CHECK_GAIN
                : InventoryMovementType.WAREHOUSE_STOCK_CHECK_LOSS,
            quantityChange: delta,
            quantityBefore: before,
            quantityAfter: after,
            ...(delta > 0
              ? { destinationType: InventoryLocationType.WAREHOUSE }
              : { sourceType: InventoryLocationType.WAREHOUSE }),
            referenceType: 'WAREHOUSE_STOCK_CHECK',
            referenceId: String(check._id),
            referenceCode: backup.code,
            backupId: String(backup._id),
            reason: dto.reason.trim(),
            createdBy: actorId,
          });
        }
        if (movementRows.length)
          await this.movements.insertMany(movementRows, { session });
        check.syncedAt = new Date();
        check.syncedBy = actorId;
        check.syncReason = dto.reason.trim();
        check.syncIdempotencyKey = dto.idempotencyKey;
        check.backupId = String(backup._id);
        await check.save({ session });
        await Promise.all([
          this.notifications.create(
            [
              {
                type: NotificationType.WAREHOUSE_STOCK_SYNCED,
                title: 'Đã đồng bộ tồn kho',
                message: dto.reason.trim(),
                audience: 'ADMIN',
                entityType: 'WAREHOUSE_STOCK_CHECK',
                entityId: String(check._id),
                entityCode: backup.code,
              },
            ],
            { session },
          ),
          this.audits.create(
            [
              {
                correlationId: randomUUID(),
                occurredAt: new Date(),
                action: AuditLogAction.UPDATE,
                status: AuditLogStatus.SUCCESS,
                actorId,
                actorFullName: actor?.fullName,
                actorRole: actor?.role,
                authenticated: true,
                method: 'POST',
                path: `/admin/inventory-stock-checks/${id}/sync`,
                resource: 'WAREHOUSE_STOCK_CHECK',
                entityId: String(check._id),
                entityCode: backup.code,
                description: dto.reason,
              },
            ],
            { session },
          ),
        ]);
        result = {
          comparisonId: String(check._id),
          backupId: String(backup._id),
          backupCode: backup.code,
          movements: movementRows.length,
          syncedAt: check.syncedAt,
        };
      });
    } catch (e: any) {
      if (e?.code === 11000) {
        const found = await this.checks
          .findOne({ syncIdempotencyKey: dto.idempotencyKey })
          .lean();
        if (found) return { data: found, idempotent: true };
      }
      throw e;
    } finally {
      await session.endSession();
    }
    return { data: result };
  }
  async exportCheck(id: string): Promise<Buffer> {
    const check: any = await this.checks
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!check) throw new NotFoundException('Không tìm thấy kết quả đối chiếu');
    return this.exportRows(
      'Kết quả đối chiếu',
      check.items.map((x: any, i: number) => ({ stt: i + 1, ...x })),
    );
  }
  private async exportRows(name: string, rows: any[]): Promise<Buffer> {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet(name, {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
    sheet.columns = [
      { header: 'STT', key: 'stt', width: 7 },
      { header: 'MÃ SẢN PHẨM', key: 'productCode', width: 20 },
      { header: 'TÊN SẢN PHẨM', key: 'productName', width: 36 },
      { header: 'ĐƠN VỊ', key: 'unit', width: 12 },
      { header: 'SỐ LƯỢNG TRÊN APP', key: 'systemQuantity', width: 22 },
      { header: 'SỐ LƯỢNG THỰC TẾ', key: 'actualQuantity', width: 22 },
      { header: 'CHÊNH LỆCH', key: 'differenceQuantity', width: 16 },
      { header: 'TRẠNG THÁI', key: 'status', width: 18 },
      { header: 'GHI CHÚ', key: 'note', width: 36 },
    ];
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: 'A1', to: 'I1' };
    ['systemQuantity', 'actualQuantity', 'differenceQuantity'].forEach(
      (x) => (sheet.getColumn(x).numFmt = '0'),
    );
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  async listBackups(q: WarehouseBackupQueryDto): Promise<any> {
    const page = Math.max(1, Number(q.page) || 1),
      limit = Math.min(100, Math.max(1, Number(q.limit) || 20)),
      filter: any = { isDeleted: false };
    if (q.sourceType) filter.sourceType = q.sourceType;
    if (q.from || q.to) {
      filter.createdAt = {};
      if (q.from) filter.createdAt.$gte = vietnamDateBoundary(q.from, false);
      if (q.to) filter.createdAt.$lte = vietnamDateBoundary(q.to, true);
    }
    const [data, total] = await Promise.all([
      this.backups
        .find(filter)
        .select('-items')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.backups.countDocuments(filter),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  async getBackup(id: string): Promise<any> {
    const doc = await this.backups
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!doc) throw new NotFoundException('Không tìm thấy bản sao tồn kho');
    return { data: doc };
  }
  async exportBackup(id: string): Promise<Buffer> {
    const result: any = await this.getBackup(id),
      doc = result.data,
      book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Bản sao tồn kho', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
    sheet.columns = [
      { header: 'STT', key: 'stt', width: 7 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 20 },
      { header: 'Tên sản phẩm', key: 'productName', width: 36 },
      { header: 'Đơn vị', key: 'unit', width: 12 },
      { header: 'Số lượng', key: 'quantity', width: 14 },
      { header: 'Giá vốn', key: 'costPrice', width: 18 },
      { header: 'Giá bán', key: 'sellPrice', width: 18 },
      { header: 'Giá trị vốn', key: 'costValue', width: 18 },
      { header: 'Giá trị bán', key: 'sellValue', width: 18 },
    ];
    doc.items.forEach((x: any, i: number) =>
      sheet.addRow({
        stt: i + 1,
        ...x,
        costValue: x.quantity * x.costPrice,
        sellValue: x.quantity * x.sellPrice,
      }),
    );
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: 'A1', to: 'I1' };
    ['quantity', 'costPrice', 'sellPrice', 'costValue', 'sellValue'].forEach(
      (x) => (sheet.getColumn(x).numFmt = '#,##0'),
    );
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  async restorePreview(id: string): Promise<any> {
    const backup: any = await this.backups
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!backup) throw new NotFoundException('Không tìm thấy bản sao tồn kho');
    const products: any[] = await this.activeProducts(),
      currentIds = new Set(products.map((x) => String(x._id))),
      missing = (backup.items || [])
        .filter((x: any) => !currentIds.has(String(x.productId)))
        .map((x: any) => ({
          productId: x.productId,
          productCode: x.productCode,
          message: 'Sản phẩm trong backup đã bị xóa hoặc không còn hoạt động',
        })),
      target = new Map<string, number>(
        (backup.items || []).map((x: any) => [
          String(x.productId),
          Number(x.quantity || 0),
        ]),
      ),
      changes = products
        .filter(
          (p) => Number(p.stock || 0) !== (target.get(String(p._id)) || 0),
        )
        .map((p) => ({
          productId: String(p._id),
          productCode: p.code,
          currentQuantity: Number(p.stock || 0),
          restoreQuantity: target.get(String(p._id)) || 0,
          differenceQuantity:
            (target.get(String(p._id)) || 0) - Number(p.stock || 0),
        })),
      blockers: any[] = [...missing];
    if (backup.restoredAt)
      blockers.push({
        code: 'WAREHOUSE_BACKUP_ALREADY_RESTORED',
        message: 'Bản sao đã được khôi phục',
      });
    return {
      data: {
        canRestore: blockers.length === 0,
        backup: {
          id: String(backup._id),
          code: backup.code,
          sourceType: backup.sourceType,
          createdAt: backup.createdAt,
        },
        summary: {
          changedProducts: changes.length,
          gainQuantity: changes
            .filter((x) => x.differenceQuantity > 0)
            .reduce((s, x) => s + x.differenceQuantity, 0),
          lossQuantity: changes
            .filter((x) => x.differenceQuantity < 0)
            .reduce((s, x) => s + Math.abs(x.differenceQuantity), 0),
        },
        changes,
        warnings: [],
        blockers,
      },
    };
  }
  async restore(
    id: string,
    dto: RestoreWarehouseStockDto,
    actorId: string,
  ): Promise<any> {
    if (
      dto.confirmation !== 'KHOI PHUC TON KHO' ||
      !dto.reason?.trim() ||
      !dto.idempotencyKey?.trim()
    )
      throw new BadRequestException(
        'Thiếu lý do, xác nhận hoặc idempotencyKey',
      );
    const prior: any = await this.backups
      .findOne({ restoreIdempotencyKey: dto.idempotencyKey })
      .lean();
    if (prior) return { data: prior, idempotent: true };
    const session = await this.connection.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const [target, actor]: any[] = await Promise.all([
          this.backups.findOne({ _id: id, isDeleted: false }).session(session),
          this.users.findById(actorId).session(session).lean(),
        ]);
        if (!target)
          throw new NotFoundException('Không tìm thấy bản sao tồn kho');
        if (target.restoredAt)
          throw new ConflictException({
            code: 'WAREHOUSE_BACKUP_ALREADY_RESTORED',
            message: 'Bản sao đã được khôi phục',
          });
        const products: any[] = await this.activeProducts(session),
          currentIds = new Set(products.map((x) => String(x._id))),
          missing = (target.items || []).filter(
            (x: any) => !currentIds.has(String(x.productId)),
          );
        if (missing.length)
          throw new ConflictException({
            code: 'WAREHOUSE_BACKUP_PRODUCT_MISSING',
            message:
              'Có sản phẩm trong backup đã bị xóa hoặc không còn hoạt động',
            products: missing.map((x: any) => ({
              productId: x.productId,
              productCode: x.productCode,
            })),
          });
        const safety: any = await this.createBackup(
            WarehouseInventoryBackupSource.BEFORE_RESTORE,
            dto.reason.trim(),
            actor,
            session,
          ),
          targetQty = new Map<string, number>(
            (target.items || []).map((x: any) => [
              String(x.productId),
              Number(x.quantity || 0),
            ]),
          ),
          rows: any[] = [];
        for (const product of products) {
          const before = Number(product.stock || 0),
            after = targetQty.get(String(product._id)) || 0;
          if (before === after) continue;
          product.stock = after;
          await product.save({ session });
          const delta = after - before;
          rows.push({
            productId: product._id,
            type:
              delta > 0
                ? InventoryMovementType.WAREHOUSE_STOCK_CHECK_GAIN
                : InventoryMovementType.WAREHOUSE_STOCK_CHECK_LOSS,
            quantityChange: delta,
            quantityBefore: before,
            quantityAfter: after,
            ...(delta > 0
              ? { destinationType: InventoryLocationType.WAREHOUSE }
              : { sourceType: InventoryLocationType.WAREHOUSE }),
            referenceType: 'WAREHOUSE_INVENTORY_RESTORE',
            referenceId: String(target._id),
            referenceCode: target.code,
            backupId: String(safety._id),
            reason: dto.reason.trim(),
            createdBy: actorId,
          });
        }
        if (rows.length) await this.movements.insertMany(rows, { session });
        target.restoredAt = new Date();
        target.restoredBy = actorId;
        target.restoreReason = dto.reason.trim();
        target.restoreIdempotencyKey = dto.idempotencyKey;
        target.restoreBackupId = String(safety._id);
        await target.save({ session });
        await Promise.all([
          this.notifications.create(
            [
              {
                type: NotificationType.WAREHOUSE_INVENTORY_RESTORED,
                title: 'Đã khôi phục tồn kho',
                message: `Khôi phục từ ${target.code}`,
                audience: 'ADMIN',
                entityType: 'WAREHOUSE_INVENTORY_BACKUP',
                entityId: String(target._id),
                entityCode: target.code,
              },
            ],
            { session },
          ),
          this.audits.create(
            [
              {
                correlationId: randomUUID(),
                occurredAt: new Date(),
                action: AuditLogAction.UPDATE,
                status: AuditLogStatus.SUCCESS,
                actorId,
                actorFullName: actor?.fullName,
                actorRole: actor?.role,
                authenticated: true,
                method: 'POST',
                path: `/admin/inventory-backups/${id}/restore`,
                resource: 'WAREHOUSE_INVENTORY_BACKUP',
                entityId: String(target._id),
                entityCode: target.code,
                description: dto.reason,
              },
            ],
            { session },
          ),
        ]);
        result = {
          backupId: String(target._id),
          safetyBackupId: String(safety._id),
          safetyBackupCode: safety.code,
          movements: rows.length,
          restoredAt: target.restoredAt,
        };
      });
    } catch (e: any) {
      if (e?.code === 11000) {
        const found = await this.backups
          .findOne({ restoreIdempotencyKey: dto.idempotencyKey })
          .lean();
        if (found) return { data: found, idempotent: true };
      }
      throw e;
    } finally {
      await session.endSession();
    }
    return { data: result };
  }
}
