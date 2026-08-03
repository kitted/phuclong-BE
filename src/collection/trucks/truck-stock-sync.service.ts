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
import { Trucks } from './schemas/trucks.schema';
import { Products } from '../products/schemas/products.schema';
import {
  TruckStockChecks,
  TruckStockCheckStatus,
} from './schemas/truck-stock-checks.schema';
import {
  TruckInventoryBackupCounters,
  TruckInventoryBackups,
  TruckInventoryBackupSource,
} from './schemas/truck-inventory-backups.schema';
import {
  InventoryMovements,
  InventoryLocationType,
  InventoryMovementType,
} from '../inventory/schemas/inventory-movement.schema';
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
import {
  InventoryBackupQueryDto,
  RestoreTruckInventoryDto,
  SyncTruckStockDto,
} from './dtos/truck-stock-sync.dto';
import { vietnamDateBoundary } from './truck-transfer-date';
@Injectable()
export class TruckStockSyncService {
  constructor(
    @InjectModel(Trucks) private trucks: ReturnModelType<typeof Trucks>,
    @InjectModel(Products) private products: ReturnModelType<typeof Products>,
    @InjectModel(TruckStockChecks)
    private checks: ReturnModelType<typeof TruckStockChecks>,
    @InjectModel(TruckInventoryBackups)
    private backups: ReturnModelType<typeof TruckInventoryBackups>,
    @InjectModel(TruckInventoryBackupCounters)
    private counters: ReturnModelType<typeof TruckInventoryBackupCounters>,
    @InjectModel(InventoryMovements)
    private movements: ReturnModelType<typeof InventoryMovements>,
    @InjectModel(Users) private users: ReturnModelType<typeof Users>,
    @InjectModel(Notifications)
    private notifications: ReturnModelType<typeof Notifications>,
    @InjectModel(AuditLogs) private audits: ReturnModelType<typeof AuditLogs>,
    @Inject(getConnectionToken()) private connection: Connection,
  ) {}
  private blockers(check: any) {
    const blocked = [
      TruckStockCheckStatus.NOT_COUNTED,
      TruckStockCheckStatus.INVALID,
      TruckStockCheckStatus.UNKNOWN,
      TruckStockCheckStatus.NOT_ON_TRUCK,
    ];
    return (check.items || [])
      .filter(
        (x: any) =>
          blocked.includes(x.status) ||
          !Number.isInteger(x.actualQuantity) ||
          x.actualQuantity < 0,
      )
      .map((x: any) => ({
        productCode: x.productCode,
        status: x.status,
        message: `${x.productCode || 'Dòng'} chưa đủ điều kiện đồng bộ`,
      }));
  }
  private stale(check: any, truck: any) {
    const expected = new Map<string, number>(
        (check.items || [])
          .filter((x: any) => x.productId && x.systemQuantity !== undefined)
          .map((x: any) => [String(x.productId), Number(x.systemQuantity)]),
      ),
      current = new Map<string, number>(
        (truck.inventory || []).map((x: any) => [
          String(x.productId),
          Number(x.qty || 0),
        ]),
      ),
      ids = new Set([...expected.keys(), ...current.keys()]);
    return [...ids]
      .filter((id) => (expected.get(id) || 0) !== (current.get(id) || 0))
      .map((productId) => ({
        productId,
        expectedQuantity: expected.get(productId) || 0,
        currentQuantity: current.get(productId) || 0,
      }));
  }
  private summary(check: any) {
    const items = check.items || [];
    return {
      totalProducts: items.length,
      matchedProducts: items.filter(
        (x: any) => x.status === TruckStockCheckStatus.MATCHED,
      ).length,
      shortageProducts: items.filter(
        (x: any) => x.status === TruckStockCheckStatus.SHORTAGE,
      ).length,
      surplusProducts: items.filter(
        (x: any) => x.status === TruckStockCheckStatus.SURPLUS,
      ).length,
      shortageQuantity: items
        .filter((x: any) => x.status === TruckStockCheckStatus.SHORTAGE)
        .reduce(
          (s: number, x: any) => s + Math.abs(x.differenceQuantity || 0),
          0,
        ),
      surplusQuantity: items
        .filter((x: any) => x.status === TruckStockCheckStatus.SURPLUS)
        .reduce((s: number, x: any) => s + (x.differenceQuantity || 0), 0),
    };
  }
  async syncPreview(id: string): Promise<any> {
    const check: any = await this.checks
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!check) throw new NotFoundException('Không tìm thấy kết quả đối chiếu');
    const truck: any = await this.trucks
      .findOne({ _id: check.truckId, isDeleted: false })
      .lean();
    if (!truck) throw new NotFoundException('Không tìm thấy xe');
    const blockers = this.blockers(check);
    if (check.syncedAt)
      blockers.push({
        code: 'STOCK_CHECK_ALREADY_SYNCED',
        message: 'Kết quả đã được đồng bộ',
      });
    const changedProducts = this.stale(check, truck);
    if (changedProducts.length)
      blockers.push({
        code: 'STOCK_CHECK_STALE',
        message: 'Tồn xe đã thay đổi sau khi đối chiếu',
        changedProducts,
      });
    return {
      data: {
        canSync: blockers.length === 0,
        truck: {
          id: String(truck._id),
          code: truck.code,
          name: truck.name,
          licensePlate: truck.licensePlate,
        },
        summary: this.summary(check),
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
  private async backupFromTruck(
    truck: any,
    sourceType: TruckInventoryBackupSource,
    reason: string,
    actor: any,
    session: any,
    stockCheckId?: string,
  ) {
    const ids = (truck.inventory || []).map((x: any) => x.productId),
      products: any[] = ids.length
        ? await this.products
            .find({ _id: { $in: ids } })
            .session(session)
            .lean()
        : [],
      map = new Map(products.map((x) => [String(x._id), x])),
      items = (truck.inventory || []).map((x: any) => {
        const p: any = map.get(String(x.productId)) || {};
        return {
          productId: String(x.productId),
          productCode: p.code || '',
          productName: p.name || '',
          unit: p.unit || '',
          quantity: Number(x.qty || 0),
          costPrice: Number(p.costPrice || 0),
          sellPrice: Number(p.sellPrice || 0),
        };
      }),
      day = new Date()
        .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
        .replaceAll('-', ''),
      counter: any = await this.counters.findOneAndUpdate(
        { key: day },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true, session },
      ),
      code = `BKTX-${day.slice(2)}-${String(counter.sequence).padStart(6, '0')}`;
    return (
      await this.backups.create(
        [
          {
            code,
            truckId: String(truck._id),
            truckCode: truck.code,
            truckName: truck.name,
            licensePlate: truck.licensePlate,
            sourceType,
            stockCheckId,
            items,
            totalProducts: items.length,
            totalQuantity: items.reduce(
              (s: number, x: any) => s + x.quantity,
              0,
            ),
            totalCostValue: items.reduce(
              (s: number, x: any) => s + x.quantity * x.costPrice,
              0,
            ),
            totalSellValue: items.reduce(
              (s: number, x: any) => s + x.quantity * x.sellPrice,
              0,
            ),
            reason,
            createdBy: String(actor?._id || ''),
            createdByName: actor?.fullName || actor?.username || '',
            checksum: this.checksum(items),
          },
        ],
        { session },
      )
    )[0];
  }
  private staleError(changedProducts: any[]): never {
    throw new ConflictException({
      code: 'STOCK_CHECK_STALE',
      message: 'Tồn xe đã thay đổi sau khi đối chiếu, vui lòng kiểm tra lại',
      changedProducts,
    });
  }
  async sync(
    id: string,
    dto: SyncTruckStockDto,
    actorId: string,
  ): Promise<any> {
    if (
      dto.confirmation !== 'DONG BO TON XE' ||
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
            code: 'STOCK_CHECK_ALREADY_SYNCED',
            message: 'Kết quả đã được đồng bộ',
          });
        const blockers = this.blockers(check);
        if (blockers.length)
          throw new ConflictException({
            code: 'STOCK_CHECK_BLOCKED',
            message: 'Kết quả đối chiếu chưa đủ điều kiện đồng bộ',
            blockers,
          });
        const truck: any = await this.trucks
          .findOne({ _id: check.truckId, isDeleted: false })
          .session(session);
        if (!truck) throw new NotFoundException('Không tìm thấy xe');
        const changed = this.stale(check, truck);
        if (changed.length) this.staleError(changed);
        const backup: any = await this.backupFromTruck(
            truck,
            TruckInventoryBackupSource.STOCK_CHECK_SYNC,
            dto.reason.trim(),
            actor,
            session,
            String(check._id),
          ),
          before = new Map<string, number>(
            (truck.inventory || []).map((x: any) => [
              String(x.productId),
              Number(x.qty || 0),
            ]),
          );
        truck.inventory = (check.items || [])
          .filter((x: any) => x.productId && x.actualQuantity > 0)
          .map((x: any) => ({ productId: x.productId, qty: x.actualQuantity }));
        await truck.save({ session });
        const movementRows = (check.items || [])
          .filter(
            (x: any) =>
              x.productId &&
              Number(x.actualQuantity) !==
                (before.get(String(x.productId)) || 0),
          )
          .map((x: any) => {
            const quantityBefore = before.get(String(x.productId)) || 0,
              quantityAfter = Number(x.actualQuantity),
              delta = quantityAfter - quantityBefore;
            return {
              productId: x.productId,
              type:
                delta > 0
                  ? InventoryMovementType.TRUCK_STOCK_CHECK_GAIN
                  : InventoryMovementType.TRUCK_STOCK_CHECK_LOSS,
              quantityChange: delta,
              quantityBefore,
              quantityAfter,
              ...(delta > 0
                ? {
                    destinationType: InventoryLocationType.TRUCK,
                    destinationTruckId: truck._id,
                  }
                : {
                    sourceType: InventoryLocationType.TRUCK,
                    sourceTruckId: truck._id,
                  }),
              referenceType: 'TRUCK_STOCK_CHECK',
              referenceId: String(check._id),
              referenceCode: backup.code,
              backupId: String(backup._id),
              createdBy: actorId,
              reason: dto.reason.trim(),
            };
          });
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
                type: NotificationType.TRUCK_STOCK_SYNCED,
                title: 'Đã đồng bộ tồn xe',
                message: `${truck.code} - ${dto.reason}`,
                audience: 'ADMIN',
                entityType: 'TRUCK_STOCK_CHECK',
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
                path: `/admin/truck-stock-checks/${id}/sync`,
                resource: 'TRUCK_STOCK_CHECK',
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
  async listBackups(truckId: string, q: InventoryBackupQueryDto): Promise<any> {
    const page = Math.max(1, Number(q.page) || 1),
      limit = Math.min(100, Math.max(1, Number(q.limit) || 20)),
      filter: any = { truckId, isDeleted: false };
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
    if (!doc) throw new NotFoundException('Không tìm thấy bản sao tồn xe');
    return { data: doc };
  }
  async restorePreview(id: string): Promise<any> {
    const backup: any = await this.backups
      .findOne({ _id: id, isDeleted: false })
      .lean();
    if (!backup) throw new NotFoundException('Không tìm thấy bản sao tồn xe');
    const truck: any = await this.trucks
      .findOne({ _id: backup.truckId, isDeleted: false })
      .lean();
    if (!truck) throw new NotFoundException('Không tìm thấy xe');
    const current = new Map<string, number>(
        (truck.inventory || []).map((x: any) => [
          String(x.productId),
          Number(x.qty || 0),
        ]),
      ),
      target = new Map<string, number>(
        (backup.items || []).map((x: any) => [
          String(x.productId),
          Number(x.quantity || 0),
        ]),
      ),
      ids = new Set([...current.keys(), ...target.keys()]),
      changes = [...ids]
        .filter((x) => (current.get(x) || 0) !== (target.get(x) || 0))
        .map((productId) => ({
          productId,
          currentQuantity: current.get(productId) || 0,
          restoreQuantity: target.get(productId) || 0,
          differenceQuantity:
            (target.get(productId) || 0) - (current.get(productId) || 0),
        }));
    return {
      data: {
        canRestore: !backup.restoredAt,
        truck: { id: String(truck._id), code: truck.code, name: truck.name },
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
        blockers: backup.restoredAt
          ? [
              {
                code: 'BACKUP_ALREADY_RESTORED',
                message: 'Bản sao đã được khôi phục',
              },
            ]
          : [],
      },
    };
  }
  async restore(
    id: string,
    dto: RestoreTruckInventoryDto,
    actorId: string,
  ): Promise<any> {
    if (
      dto.confirmation !== 'KHOI PHUC TON XE' ||
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
          throw new NotFoundException('Không tìm thấy bản sao tồn xe');
        if (target.restoredAt)
          throw new ConflictException({
            code: 'BACKUP_ALREADY_RESTORED',
            message: 'Bản sao đã được khôi phục',
          });
        const truck: any = await this.trucks
          .findOne({ _id: target.truckId, isDeleted: false })
          .session(session);
        if (!truck) throw new NotFoundException('Không tìm thấy xe');
        const safety: any = await this.backupFromTruck(
            truck,
            TruckInventoryBackupSource.BEFORE_RESTORE,
            dto.reason.trim(),
            actor,
            session,
          ),
          before = new Map<string, number>(
            (truck.inventory || []).map((x: any) => [
              String(x.productId),
              Number(x.qty || 0),
            ]),
          ),
          after = new Map<string, number>(
            (target.items || []).map((x: any) => [
              String(x.productId),
              Number(x.quantity || 0),
            ]),
          ),
          ids = new Set([...before.keys(), ...after.keys()]);
        truck.inventory = (target.items || [])
          .filter((x: any) => x.quantity > 0)
          .map((x: any) => ({ productId: x.productId, qty: x.quantity }));
        await truck.save({ session });
        const rows = [...ids]
          .filter(
            (productId) =>
              (before.get(productId) || 0) !== (after.get(productId) || 0),
          )
          .map((productId) => {
            const quantityBefore = before.get(productId) || 0,
              quantityAfter = after.get(productId) || 0,
              delta = quantityAfter - quantityBefore;
            return {
              productId,
              type:
                delta > 0
                  ? InventoryMovementType.TRUCK_STOCK_CHECK_GAIN
                  : InventoryMovementType.TRUCK_STOCK_CHECK_LOSS,
              quantityChange: delta,
              quantityBefore,
              quantityAfter,
              ...(delta > 0
                ? {
                    destinationType: InventoryLocationType.TRUCK,
                    destinationTruckId: truck._id,
                  }
                : {
                    sourceType: InventoryLocationType.TRUCK,
                    sourceTruckId: truck._id,
                  }),
              referenceType: 'TRUCK_INVENTORY_RESTORE',
              referenceId: String(target._id),
              referenceCode: target.code,
              backupId: String(safety._id),
              createdBy: actorId,
              reason: dto.reason.trim(),
            };
          });
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
                type: NotificationType.TRUCK_INVENTORY_RESTORED,
                title: 'Đã khôi phục tồn xe',
                message: `${truck.code} từ ${target.code}`,
                audience: 'ADMIN',
                entityType: 'TRUCK_INVENTORY_BACKUP',
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
                path: `/admin/truck-inventory-backups/${id}/restore`,
                resource: 'TRUCK_INVENTORY_BACKUP',
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
  async exportBackup(id: string): Promise<Buffer> {
    const result: any = await this.getBackup(id),
      doc = result.data,
      book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Bản sao tồn xe', {
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
}
