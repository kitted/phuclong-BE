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
import * as ExcelJS from 'exceljs';
import {
  GoodsAdvanceCounters,
  GoodsAdvances,
  GoodsAdvanceStatus,
} from './schemas/goods-advances.schema';
import {
  ChangeGoodsAdvanceStatusDto,
  CreateGoodsAdvanceDto,
  GoodsAdvanceQueryDto,
  UpdateGoodsAdvanceDto,
} from './dtos/goods-advances.dto';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { Users, UserStatus } from '../users/schemas/users.schema';
import { InventoryMovements } from '../inventory/schemas/inventory-movement.schema';
import {
  InventoryLocationType,
  InventoryMovementType,
} from '../inventory/schemas/inventory-movement.schema';
import {
  Notifications,
  NotificationType,
} from '../notifications/schemas/notifications.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import { vietnamDateBoundary } from '../trucks/truck-transfer-date';
@Injectable()
export class GoodsAdvancesService {
  constructor(
    @InjectModel(GoodsAdvances)
    private model: ReturnModelType<typeof GoodsAdvances>,
    @InjectModel(GoodsAdvanceCounters)
    private counters: ReturnModelType<typeof GoodsAdvanceCounters>,
    @InjectModel(Products) private products: ReturnModelType<typeof Products>,
    @InjectModel(Trucks) private trucks: ReturnModelType<typeof Trucks>,
    @InjectModel(Users) private users: ReturnModelType<typeof Users>,
    @InjectModel(InventoryMovements)
    private movements: ReturnModelType<typeof InventoryMovements>,
    @InjectModel(Notifications)
    private notifications: ReturnModelType<typeof Notifications>,
    @Inject(getConnectionToken()) private connection: Connection,
  ) {}
  private async resolve(dto: CreateGoodsAdvanceDto, session?: any) {
    const [employee, truck, products]: any[] = await Promise.all([
      this.users
        .findOne({
          _id: dto.employeeId,
          role: RoleEnum.STAFF,
          status: UserStatus.ACTIVE,
          isDeleted: false,
        })
        .session(session)
        .lean(),
      this.trucks
        .findOne({ _id: dto.truckId, status: 'active', isDeleted: false })
        .session(session)
        .lean(),
      this.products
        .find({
          _id: { $in: dto.items.map((x) => x.productId) },
          isDeleted: false,
        })
        .session(session)
        .lean(),
    ]);
    if (!employee) throw new BadRequestException('Nhân viên không hoạt động');
    if (!truck) throw new BadRequestException('Xe không hoạt động');
    const map = new Map(products.map((p) => [String(p._id), p]));
    if (map.size !== new Set(dto.items.map((x) => x.productId)).size)
      throw new BadRequestException('Có sản phẩm không tồn tại');
    return {
      employee,
      truck,
      items: dto.items.map((x) => {
        const p: any = map.get(x.productId);
        return {
          productId: String(p._id),
          productCode: p.code,
          productName: p.name,
          unit: p.unit || '',
          quantity: x.quantity,
          note: x.note,
        };
      }),
    };
  }
  private async code() {
    const local = new Date(Date.now() + 25200000),
      day = `${local.getUTCFullYear()}${String(local.getUTCMonth() + 1).padStart(2, '0')}${String(local.getUTCDate()).padStart(2, '0')}`,
      c: any = await this.counters.findOneAndUpdate(
        { key: day },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true },
      );
    return `TUH-${day.slice(2)}-${String(c.sequence).padStart(6, '0')}`;
  }
  async create(dto: CreateGoodsAdvanceDto, actorId: string) {
    if (
      dto.status &&
      ![GoodsAdvanceStatus.DRAFT, GoodsAdvanceStatus.CONFIRMED].includes(
        dto.status,
      )
    )
      throw new BadRequestException('Trạng thái tạo phiếu không hợp lệ');
    const resolved = await this.resolve(dto),
      doc: any = await this.model.create({
        code: await this.code(),
        date: dto.date ? new Date(dto.date) : new Date(),
        employeeId: String(resolved.employee._id),
        employeeCode: resolved.employee.employeeCode,
        employeeName: resolved.employee.fullName || resolved.employee.username,
        truckId: String(resolved.truck._id),
        truckCode: resolved.truck.code,
        truckName: resolved.truck.name,
        truckLicensePlate: resolved.truck.licensePlate,
        items: resolved.items,
        note: dto.note,
        issues: dto.issues,
        warehouseIssuerName: dto.warehouseIssuerName,
        advanceRecipientName: dto.advanceRecipientName,
        status: GoodsAdvanceStatus.DRAFT,
        createdBy: actorId,
      });
    if (dto.status === GoodsAdvanceStatus.CONFIRMED)
      return this.changeStatus(
        String(doc._id),
        { status: GoodsAdvanceStatus.CONFIRMED },
        actorId,
      );
    return { data: doc };
  }
  async update(id: string, dto: UpdateGoodsAdvanceDto) {
    const doc: any = await this.model.findOne({
      _id: id,
      status: GoodsAdvanceStatus.DRAFT,
      isDeleted: false,
    });
    if (!doc) throw new ConflictException('Chỉ có thể sửa phiếu nháp');
    const r = await this.resolve(dto);
    Object.assign(doc, {
      date: dto.date ? new Date(dto.date) : doc.date,
      employeeId: String(r.employee._id),
      employeeCode: r.employee.employeeCode,
      employeeName: r.employee.fullName || r.employee.username,
      truckId: String(r.truck._id),
      truckCode: r.truck.code,
      truckName: r.truck.name,
      truckLicensePlate: r.truck.licensePlate,
      items: r.items,
      note: dto.note,
      issues: dto.issues,
      warehouseIssuerName: dto.warehouseIssuerName,
      advanceRecipientName: dto.advanceRecipientName,
    });
    await doc.save();
    return { data: doc };
  }
  async changeStatus(
    id: string,
    dto: ChangeGoodsAdvanceStatusDto,
    actorId: string,
  ) {
    if (
      ![GoodsAdvanceStatus.CONFIRMED, GoodsAdvanceStatus.CANCELLED].includes(
        dto.status,
      )
    )
      throw new BadRequestException('Trạng thái không hợp lệ');
    if (dto.status === GoodsAdvanceStatus.CANCELLED && !dto.reason?.trim())
      throw new BadRequestException('Phải nhập lý do hủy');
    if (dto.status === GoodsAdvanceStatus.CANCELLED) {
      const doc = await this.model.findOneAndUpdate(
        { _id: id, status: GoodsAdvanceStatus.DRAFT, isDeleted: false },
        {
          $set: {
            status: GoodsAdvanceStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledBy: actorId,
            cancelReason: dto.reason!.trim(),
          },
        },
        { new: true },
      );
      if (!doc) throw new ConflictException('Chỉ phiếu nháp mới được hủy');
      return { data: doc };
    }
    const session = await this.connection.startSession();
    let result: any;
    try {
      await session.withTransaction(async () => {
        const doc: any = await this.model
          .findOne({
            _id: id,
            status: GoodsAdvanceStatus.DRAFT,
            isDeleted: false,
          })
          .session(session);
        if (!doc)
          throw new ConflictException(
            'Phiếu không tồn tại hoặc đã được xác nhận',
          );
        const truck: any = await this.trucks
          .findOne({ _id: doc.truckId, status: 'active', isDeleted: false })
          .session(session);
        if (!truck) throw new ConflictException('Xe không còn hoạt động');
        const movements: any[] = [];
        for (const item of doc.items) {
          const product: any = await this.products.findOneAndUpdate(
            {
              _id: item.productId,
              isDeleted: false,
              stock: { $gte: item.quantity },
            },
            { $inc: { stock: -item.quantity } },
            { new: false, session },
          );
          if (!product)
            throw new ConflictException({
              code: 'GOODS_ADVANCE_STOCK_NOT_ENOUGH',
              message: `Kho không đủ ${item.productName}`,
            });
          const warehouseBefore = Number(product.stock || 0),
            entry: any = truck.inventory.find(
              (x: any) => String(x.productId) === String(item.productId),
            ),
            truckBefore = Number(entry?.qty || 0);
          if (entry) entry.qty = truckBefore + item.quantity;
          else
            truck.inventory.push({
              productId: item.productId,
              qty: item.quantity,
            });
          movements.push({
            productId: item.productId,
            type: InventoryMovementType.TRANSFER_TO_TRUCK,
            quantityChange: -item.quantity,
            quantityBefore: warehouseBefore,
            quantityAfter: warehouseBefore - item.quantity,
            sourceType: InventoryLocationType.WAREHOUSE,
            destinationType: InventoryLocationType.TRUCK,
            destinationTruckId: truck._id,
            referenceType: 'GOODS_ADVANCE',
            referenceId: String(doc._id),
            referenceCode: doc.code,
            createdBy: actorId,
          });
        }
        await truck.save({ session });
        if (movements.length)
          await this.movements.insertMany(movements, { session });
        doc.status = GoodsAdvanceStatus.CONFIRMED;
        doc.confirmedAt = new Date();
        doc.confirmedBy = actorId;
        await doc.save({ session });
        await this.notifications.create(
          [
            {
              type: NotificationType.TRUCK_LOADED,
              title: 'Đã xác nhận phiếu tạm ứng hàng',
              message: `${doc.code} - ${truck.code}`,
              audience: 'ADMIN',
              entityType: 'GOODS_ADVANCE',
              entityId: String(doc._id),
              entityCode: doc.code,
            },
          ],
          { session },
        );
        result = doc.toObject();
      });
    } finally {
      await session.endSession();
    }
    return { data: result };
  }
  async findAll(q: GoodsAdvanceQueryDto): Promise<any> {
    const page = Math.max(1, Number(q.page) || 1),
      limit = Math.min(100, Math.max(1, Number(q.limit) || 20)),
      filter: any = { isDeleted: false };
    if (q.status) filter.status = q.status;
    if (q.from || q.to) {
      filter.date = {};
      if (q.from) filter.date.$gte = vietnamDateBoundary(q.from, false);
      if (q.to) filter.date.$lte = vietnamDateBoundary(q.to, true);
    }
    if (q.search?.trim()) {
      const regex = { $regex: q.search.trim(), $options: 'i' };
      filter.$or = [
        { code: regex },
        { employeeName: regex },
        { truckCode: regex },
        { truckName: regex },
      ];
    }
    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ date: -1, _id: -1 })
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
    const doc = await this.model.findOne({ _id: id, isDeleted: false }).lean();
    if (!doc) throw new NotFoundException('Không tìm thấy phiếu tạm ứng');
    return { data: doc };
  }
  async export(id: string) {
    const r: any = await this.findOne(id),
      doc = r.data,
      book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Phiếu tạm ứng hàng');
    sheet.addRows([
      ['PHIẾU TẠM ỨNG HÀNG'],
      ['Mã phiếu', doc.code],
      ['Ngày giờ', doc.date],
      ['Nhân viên', doc.employeeName],
      ['Xe nhận hàng', `${doc.truckCode} - ${doc.truckName}`],
      [],
    ]);
    sheet.addRow([
      'STT',
      'Mã sản phẩm',
      'Tên sản phẩm',
      'Đơn vị',
      'Số lượng',
      'Ghi chú',
    ]);
    doc.items.forEach((x: any, i: number) =>
      sheet.addRow([
        i + 1,
        x.productCode,
        x.productName,
        x.unit,
        x.quantity,
        x.note || '',
      ]),
    );
    sheet.columns = [
      { width: 8 },
      { width: 20 },
      { width: 36 },
      { width: 14 },
      { width: 14 },
      { width: 36 },
    ];
    sheet.getRow(1).font = { bold: true, size: 16 };
    sheet.mergeCells('A1:F1');
    sheet.getRow(7).font = { bold: true };
    return Buffer.from(await book.xlsx.writeBuffer());
  }
}
