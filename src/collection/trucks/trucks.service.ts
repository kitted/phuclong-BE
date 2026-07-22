import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Connection, Types } from 'mongoose';
import { Trucks } from './schemas/trucks.schema';
import { Products } from '../products/schemas/products.schema';
import { TruckTransferCounters, TruckTransfers, TruckTransferType } from './schemas/truck-transfers.schema';
import { AvailableProductsQueryDto, ChangeTruckStatusDto, CreateTruckDto, LoadGoodsDto, ReturnGoodsDto, ReverseTruckTransferDto, TruckListQueryDto, TruckStatus, TruckToTruckTransferDto, TruckTransferQueryDto, UpdateTruckDto } from './dtos/trucks.dto';
import { ID } from '../../core/interfaces/id.interface';
import { InventoryMovementsService } from '../inventory/inventory-movements.service';
import { InventoryLocationType, InventoryMovementType } from '../inventory/schemas/inventory-movement.schema';
import { Users, UserStatus } from '../users/schemas/users.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import { AvailableDriversQueryDto } from './dtos/trucks.dto';
import * as ExcelJS from 'exceljs';
import { vietnamDateBoundary } from './truck-transfer-date';

@Injectable()
export class TrucksService {
  constructor(
    @InjectModel(Trucks) private readonly model: ReturnModelType<typeof Trucks>,
    @InjectModel(Products) private readonly productModel: ReturnModelType<typeof Products>,
    @InjectModel(TruckTransfers) private readonly transferModel: ReturnModelType<typeof TruckTransfers>,
    @InjectModel(TruckTransferCounters) private readonly transferCounterModel: ReturnModelType<typeof TruckTransferCounters>,
    @InjectModel(Users) private readonly userModel: ReturnModelType<typeof Users>,
    private readonly movements: InventoryMovementsService,
    @Inject(getConnectionToken()) private readonly connection: Connection,
  ) {}

  private positiveInt(value: string | undefined, fallback: number, max?: number) {
    const number = Number(value || fallback);
    if (!Number.isInteger(number) || number < 1 || (max && number > max)) throw new BadRequestException('Tham số phân trang không hợp lệ');
    return number;
  }

  private normalizePlate(value: string) { return value.trim().toUpperCase().replace(/\s+/g, ''); }

  private async nextCode() {
    const latest = await this.model.findOne({ code: /^T\d+$/ }).sort({ code: -1 }).select('code').lean();
    return `T${String(Number(latest?.code?.match(/\d+$/)?.[0] || 0) + 1).padStart(2, '0')}`;
  }

  private async resolveDriver(driverId?: string | null, currentTruckId?: string) {
    if (driverId === null) return { driverId: null, driverName: null, driverPhone: null };
    if (driverId === undefined) return {};
    if (!Types.ObjectId.isValid(driverId)) throw new BadRequestException('driverId không hợp lệ');
    const employee: any = await this.userModel.findOne({
      _id: driverId,
      role: RoleEnum.STAFF,
      status: UserStatus.ACTIVE,
      isDeleted: false,
    }).select('employeeCode fullName phone status').lean();
    if (!employee) throw new BadRequestException('Nhân viên không hoạt động hoặc không thể được phân công làm tài xế');
    const assigned: any = await this.model.findOne({
      driverId,
      isDeleted: false,
      ...(currentTruckId ? { _id: { $ne: currentTruckId } } : {}),
    }).select('code').lean();
    if (assigned) throw new ConflictException(`Nhân viên ${employee.employeeCode || employee.fullName} đang được phân công cho xe ${assigned.code}`);
    return { driverId: employee._id, driverName: employee.fullName || employee.employeeCode || '', driverPhone: employee.phone || '' };
  }

  async create(dto: CreateTruckDto) {
    const code = dto.code?.trim().toUpperCase() || await this.nextCode();
    const licensePlate = this.normalizePlate(dto.licensePlate);
    if (await this.model.exists({ code, isDeleted: false })) throw new ConflictException('Mã xe đã tồn tại');
    if (await this.model.exists({ licensePlate, isDeleted: false })) throw new ConflictException('Biển số xe đã tồn tại');
    const driver = await this.resolveDriver(dto.driverId);
    const { driverId: _driverId, ...safeDto } = dto as any;
    delete safeDto.driver; delete safeDto.phone; delete safeDto.driverName; delete safeDto.driverPhone; delete safeDto.inventory;
    let truck: any;
    try {
      truck = await this.model.create({ ...safeDto, ...driver, code, licensePlate, inventory: [] });
    } catch (error: any) {
      if (error?.code === 11000 && error?.keyPattern?.driverId) throw new ConflictException('Nhân viên đã được phân công cho xe khác');
      throw error;
    }
    return { data: truck };
  }

  private async productMapFor(trucks: any[]) {
    const ids = [...new Set(trucks.flatMap((truck) => (truck.inventory || []).map((item) => String(item.productId))))];
    const products = ids.length ? await this.productModel.find({ _id: { $in: ids }, isDeleted: false }).select('code name unit costPrice').lean() : [];
    return new Map(products.map((product: any) => [String(product._id), product]));
  }

  private async driverMapFor(trucks: any[]) {
    const ids = [...new Set(trucks.map((truck) => truck.driverId && String(truck.driverId)).filter(Boolean))];
    const drivers = ids.length ? await this.userModel.find({ _id: { $in: ids }, isDeleted: false }).select('employeeCode fullName phone status').lean() : [];
    return new Map(drivers.map((driver: any) => [String(driver._id), driver]));
  }

  private mapTruck(truck: any, products: Map<string, any>, preview = false, drivers = new Map<string, any>()) {
    const inventory = (truck.inventory || []).map((item) => {
      const product = products.get(String(item.productId)); const quantity = Number(item.qty) || 0; const costPrice = Number(product?.costPrice) || 0;
      return { productId: String(item.productId), code: product?.code || '', name: product?.name || '', unit: product?.unit || '', quantity, costPrice, stockValue: quantity * costPrice };
    }).filter((item) => item.quantity > 0);
    const inventorySummary = {
      productTypes: inventory.length,
      totalQuantity: inventory.reduce((sum, item) => sum + item.quantity, 0),
      totalValue: inventory.reduce((sum, item) => sum + item.stockValue, 0),
    };
    const assignedDriver = truck.driverId ? drivers.get(String(truck.driverId)) : null;
    const driver = assignedDriver ? { id: String(assignedDriver._id), employeeCode: assignedDriver.employeeCode, fullName: assignedDriver.fullName, phone: assignedDriver.phone, status: assignedDriver.status, isDeleted: assignedDriver.isDeleted } : null;
    const base = { id: String(truck._id), code: truck.code, name: truck.name, licensePlate: truck.licensePlate, driver, driverName: truck.driverName || truck.driver || '', driverPhone: truck.driverPhone || truck.phone || '', status: truck.status, inventorySummary, createdAt: truck.createdAt, updatedAt: truck.updatedAt };
    return preview ? { ...base, inventoryPreview: inventory.slice(0, 3) } : { ...base, inventory };
  }

  async findAll(query: TruckListQueryDto): Promise<any> {
    const page = this.positiveInt(query.page, 1); const limit = this.positiveInt(query.limit, 20, 100);
    const filter: any = { isDeleted: false };
    if (query.status) filter.status = query.status;
    if (query.driverId) filter.driverId = query.driverId;
    if (query.hasDriver === 'true') filter.driverId = { $type: 'objectId' };
    if (query.hasDriver === 'false') filter.$and = [{ $or: [{ driverId: null }, { driverId: { $exists: false } }] }];
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchFilter = ['code', 'name', 'licensePlate', 'driverName', 'driverPhone', 'driver', 'phone'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
      if (filter.$and) filter.$and.push({ $or: searchFilter }); else filter.$or = searchFilter;
    }
    if (query.hasInventory === 'true') filter.$expr = { $gt: [{ $sum: '$inventory.qty' }, 0] };
    if (query.hasInventory === 'false') filter.$expr = { $lte: [{ $sum: '$inventory.qty' }, 0] };
    const sortBy = query.sortBy || 'createdAt'; const direction = query.sortOrder === 'asc' ? 1 : -1;
    const [trucks, totalItems] = await Promise.all([
      this.model.find(filter).sort({ [sortBy]: direction }).skip((page - 1) * limit).limit(limit).lean(),
      this.model.countDocuments(filter),
    ]);
    const [products, drivers] = await Promise.all([this.productMapFor(trucks), this.driverMapFor(trucks)]);
    return { data: trucks.map((truck) => this.mapTruck(truck, products, true, drivers)), meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } };
  }

  async summary() {
    const trucks = await this.model.find({ isDeleted: false }).select('status inventory driverId').lean();
    const products = await this.productMapFor(trucks); const mapped = trucks.map((truck) => this.mapTruck(truck, products));
    return { data: {
      totalTrucks: trucks.length,
      activeTrucks: trucks.filter((truck) => truck.status === TruckStatus.ACTIVE).length,
      inactiveTrucks: trucks.filter((truck) => truck.status === TruckStatus.INACTIVE).length,
      trucksWithInventory: mapped.filter((truck) => truck.inventorySummary.totalQuantity > 0).length,
      trucksWithoutDriver: trucks.filter((truck) => !truck.driverId).length,
      totalTruckQuantity: mapped.reduce((sum, truck) => sum + truck.inventorySummary.totalQuantity, 0),
      totalTruckInventoryValue: mapped.reduce((sum, truck) => sum + truck.inventorySummary.totalValue, 0),
    } };
  }

  async findOne(id: ID | string) {
    const truck = await this.model.findOne({ _id: id, isDeleted: false }).lean();
    if (!truck) throw new NotFoundException('Không tìm thấy xe tải');
    const [products, drivers] = await Promise.all([this.productMapFor([truck]), this.driverMapFor([truck])]);
    return { data: this.mapTruck(truck, products, false, drivers) };
  }

  async update(id: ID | string, dto: UpdateTruckDto) {
    const update: any = { ...dto };
    delete update.driver; delete update.phone; delete update.driverName; delete update.driverPhone; delete update.inventory;
    if (dto.code) {
      update.code = dto.code.trim().toUpperCase();
      if (await this.model.exists({ code: update.code, _id: { $ne: id }, isDeleted: false })) throw new ConflictException('Mã xe đã tồn tại');
    }
    if (dto.licensePlate) {
      update.licensePlate = this.normalizePlate(dto.licensePlate);
      if (await this.model.exists({ licensePlate: update.licensePlate, _id: { $ne: id }, isDeleted: false })) throw new ConflictException('Biển số xe đã tồn tại');
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'driverId')) Object.assign(update, await this.resolveDriver(dto.driverId, String(id)));
    else delete update.driverId;
    let truck: any;
    try {
      truck = await this.model.findOneAndUpdate({ _id: id, isDeleted: false }, update, { new: true, runValidators: true });
    } catch (error: any) {
      if (error?.code === 11000 && error?.keyPattern?.driverId) throw new ConflictException('Nhân viên đã được phân công cho xe khác');
      throw error;
    }
    if (!truck) throw new NotFoundException('Không tìm thấy xe tải');
    return { data: truck };
  }

  async changeStatus(id: string, dto: ChangeTruckStatusDto) {
    if (!Object.values(TruckStatus).includes(dto.status)) throw new BadRequestException('Trạng thái xe không hợp lệ');
    const truck = await this.model.findOneAndUpdate({ _id: id, isDeleted: false }, { status: dto.status }, { new: true, runValidators: true });
    if (!truck) throw new NotFoundException('Không tìm thấy xe tải');
    return { data: truck };
  }

  async remove(id: ID | string) {
    const truck = await this.model.findOne({ _id: id, isDeleted: false });
    if (!truck) throw new NotFoundException('Không tìm thấy xe tải');
    if (truck.inventory.some((item) => item.qty > 0)) throw new ConflictException({ code: 'TRUCK_HAS_INVENTORY', message: 'Không thể xóa xe khi vẫn còn hàng' });
    truck.isDeleted = true; truck.deletedAt = new Date(); await truck.save();
    return { data: { id: String(truck._id), deleted: true } };
  }

  async availableProducts(query: AvailableProductsQueryDto) {
    const page = this.positiveInt(query.page, 1); const limit = this.positiveInt(query.limit, 20, 1000);
    const filter: any = { isDeleted: false, stock: { $gt: 0 } };
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ code: { $regex: escaped, $options: 'i' } }, { name: { $regex: escaped, $options: 'i' } }];
    }
    const [products, totalItems] = await Promise.all([this.productModel.find(filter).sort({ code: 1 }).skip((page - 1) * limit).limit(limit).lean(), this.productModel.countDocuments(filter)]);
    return { data: products.map((product: any) => ({ id: String(product._id), productId: String(product._id), code: product.code, name: product.name, unit: product.unit || '', stock: product.stock || 0, warehouseQuantity: product.stock || 0, costPrice: product.costPrice || 0 })), meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } };
  }

  async availableDrivers(query: AvailableDriversQueryDto) {
    const limit = this.positiveInt(query.limit, 20, 100);
    const assignments = await this.model.find({ isDeleted: false }).select('code name driverId').lean();
    const blockedIds = assignments
      .filter((truck) => truck.driverId && String(truck._id) !== query.excludeTruckId)
      .map((truck) => truck.driverId);
    const filter: any = { role: RoleEnum.STAFF, status: UserStatus.ACTIVE, isDeleted: false };
    if (blockedIds.length) filter._id = { $nin: blockedIds };
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['employeeCode', 'fullName', 'phone'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
    }
    const employees = await this.userModel.find(filter).select('employeeCode fullName phone status').sort({ employeeCode: 1 }).limit(limit).lean();
    const assignmentByDriver = new Map(assignments.filter((truck) => truck.driverId).map((truck) => [String(truck.driverId), { id: String(truck._id), code: truck.code, name: truck.name }]));
    return { data: employees.map((employee: any) => ({ id: String(employee._id), employeeCode: employee.employeeCode, fullName: employee.fullName, phone: employee.phone, status: employee.status, assignedTruck: assignmentByDriver.get(String(employee._id)) || null })) };
  }

  async availableTruckProducts(truckId: string, query: AvailableProductsQueryDto) {
    const page = this.positiveInt(query.page, 1); const limit = this.positiveInt(query.limit, 20, 100);
    const truck: any = await this.model.findOne({ _id: truckId, isDeleted: false }).select('inventory').lean();
    if (!truck) throw new NotFoundException('Không tìm thấy xe tải');
    const quantities = new Map((truck.inventory || []).filter((item) => item.qty > 0).map((item) => [String(item.productId), item.qty]));
    const filter: any = { _id: { $in: [...quantities.keys()] }, isDeleted: false };
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ code: { $regex: escaped, $options: 'i' } }, { name: { $regex: escaped, $options: 'i' } }, { barcode: { $regex: escaped, $options: 'i' } }];
    }
    const [products, totalItems] = await Promise.all([this.productModel.find(filter).sort({ code: 1 }).skip((page - 1) * limit).limit(limit).lean(), this.productModel.countDocuments(filter)]);
    return { data: products.map((product: any) => ({ id: String(product._id), productId: String(product._id), code: product.code, name: product.name, unit: product.unit || '', quantity: quantities.get(String(product._id)) || 0, sellPrice: product.sellPrice || 0 })), meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } };
  }

  private mergedItems(items: Array<{ productId: string; qty: number }>) {
    if (!Array.isArray(items) || !items.length) throw new BadRequestException('Phiếu phải có ít nhất một sản phẩm');
    const merged = new Map<string, number>();
    for (const item of items) {
      if (!Types.ObjectId.isValid(item.productId) || !Number.isInteger(item.qty) || item.qty < 1) throw new BadRequestException('Sản phẩm hoặc số lượng không hợp lệ');
      merged.set(item.productId, (merged.get(item.productId) || 0) + item.qty);
    }
    return [...merged].map(([productId, qty]) => ({ productId, qty }));
  }

  private transferCode(type: TruckTransferType, requested?: string) {
    return requested?.trim().toUpperCase() || `${type === TruckTransferType.LOAD ? 'PX' : 'PH'}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;
  }

  async loadGoods(id: ID | string, dto: LoadGoodsDto, createdBy?: string) {
    return this.moveGoods(String(id), dto, TruckTransferType.LOAD, createdBy);
  }

  async returnGoods(id: ID | string, dto: ReturnGoodsDto, createdBy?: string) {
    return this.moveGoods(String(id), dto, TruckTransferType.RETURN, createdBy);
  }

  private truckTransferDay(date: Date) { const value = new Date(date.getTime() + 25200000); return `${String(value.getUTCFullYear()).slice(2)}${String(value.getUTCMonth() + 1).padStart(2, '0')}${String(value.getUTCDate()).padStart(2, '0')}`; }
  private async truckTransferContext(sourceTruckId: string, dto: TruckToTruckTransferDto, session: any = null) {
    if (!Types.ObjectId.isValid(sourceTruckId) || !Types.ObjectId.isValid(dto.destinationTruckId)) throw new BadRequestException('Xe nguồn hoặc xe nhận không hợp lệ');
    if (sourceTruckId === dto.destinationTruckId) throw new BadRequestException('Xe nguồn và xe nhận không được giống nhau');
    const items = this.mergedItems(dto.items); const date = dto.date ? new Date(dto.date) : new Date(); if (Number.isNaN(+date)) throw new BadRequestException('Ngày điều chuyển không hợp lệ');
    const [sourceTruck, destinationTruck]: any[] = await Promise.all([this.model.findOne({ _id: sourceTruckId, isDeleted: false }).session(session).lean(), this.model.findOne({ _id: dto.destinationTruckId, isDeleted: false }).session(session).lean()]);
    if (!sourceTruck) throw new NotFoundException('Không tìm thấy xe nguồn'); if (!destinationTruck) throw new NotFoundException('Không tìm thấy xe nhận');
    if (destinationTruck.status !== TruckStatus.ACTIVE) throw new ConflictException('Xe nhận đang ngừng hoạt động');
    const driverIds = [sourceTruck.driverId, destinationTruck.driverId].filter(Boolean); const drivers: any[] = driverIds.length ? await this.userModel.find({ _id: { $in: driverIds }, isDeleted: false }).select('employeeCode fullName phone role status').session(session).lean() : [];
    const driverMap = new Map(drivers.map((driver) => [String(driver._id), driver])); const sourceDriver: any = sourceTruck.driverId ? driverMap.get(String(sourceTruck.driverId)) : null; const destinationDriver: any = destinationTruck.driverId ? driverMap.get(String(destinationTruck.driverId)) : null;
    if (!destinationDriver || destinationDriver.role !== RoleEnum.STAFF || destinationDriver.status !== UserStatus.ACTIVE) throw new ConflictException('Xe nhận phải có tài xế đang hoạt động');
    const products: any[] = await this.productModel.find({ _id: { $in: items.map((item) => item.productId) }, isDeleted: false }).select('code name unit costPrice').session(session).lean(); if (products.length !== items.length) throw new BadRequestException('Một hoặc nhiều sản phẩm không tồn tại');
    const productMap = new Map<string, any>(products.map((product) => [String(product._id), product])); const sourceInventory = new Map<string, number>((sourceTruck.inventory || []).map((item) => [String(item.productId), Number(item.qty) || 0])); const destinationInventory = new Map<string, number>((destinationTruck.inventory || []).map((item) => [String(item.productId), Number(item.qty) || 0]));
    const snapshots = items.map((item) => { const product: any = productMap.get(item.productId); const sourceQuantity = sourceInventory.get(item.productId) || 0; if (sourceQuantity < item.qty) throw new ConflictException({ code: 'SOURCE_TRUCK_INSUFFICIENT_STOCK', message: 'Xe nguồn không đủ hàng', details: { productId: item.productId, availableQuantity: sourceQuantity, requestedQuantity: item.qty } }); const unitCost = Number(product.costPrice) || 0; return { productId: item.productId, productCode: product.code, productName: product.name, unit: product.unit || '', qty: item.qty, quantity: item.qty, unitCost, costPrice: unitCost, totalValue: item.qty * unitCost, sourceQuantityBefore: sourceQuantity, sourceQuantityAfter: sourceQuantity - item.qty, destinationQuantityBefore: destinationInventory.get(item.productId) || 0, destinationQuantityAfter: (destinationInventory.get(item.productId) || 0) + item.qty }; });
    return { sourceTruck, destinationTruck, sourceDriver, destinationDriver, date, snapshots };
  }

  async previewTruckTransfer(sourceTruckId: string, dto: TruckToTruckTransferDto): Promise<any> {
    const context = await this.truckTransferContext(sourceTruckId, dto); const products = await this.productMapFor([context.sourceTruck, context.destinationTruck]); const drivers = await this.driverMapFor([context.sourceTruck, context.destinationTruck]);
    return { data: { sourceTruck: this.mapTruck(context.sourceTruck, products, false, drivers), destinationTruck: this.mapTruck(context.destinationTruck, products, false, drivers), items: context.snapshots, totalQuantity: context.snapshots.reduce((sum, item) => sum + item.qty, 0), totalValue: context.snapshots.reduce((sum, item) => sum + item.totalValue, 0), warnings: context.sourceTruck.status === TruckStatus.INACTIVE ? ['Xe nguồn đang ngừng hoạt động'] : [] } };
  }

  async transferBetweenTrucks(sourceTruckId: string, dto: TruckToTruckTransferDto, createdBy?: string, reversalOf?: string): Promise<any> {
    const session = await this.connection.startSession(); let result: any;
    try { await session.withTransaction(async () => {
      const context = await this.truckTransferContext(sourceTruckId, dto, session); const day = this.truckTransferDay(context.date); const counter: any = await this.transferCounterModel.findOneAndUpdate({ key: `TRUCK_TO_TRUCK_${day}` }, { $inc: { sequence: 1 } }, { upsert: true, new: true, session }); const code = `CX-${day}-${String(counter.sequence).padStart(6, '0')}`;
      for (const item of context.snapshots) {
        const source = await this.model.updateOne({ _id: context.sourceTruck._id, inventory: { $elemMatch: { productId: item.productId, qty: { $gte: item.qty } } } }, { $inc: { 'inventory.$.qty': -item.qty } }, { session }); if (source.modifiedCount !== 1) throw new ConflictException({ code: 'SOURCE_TRUCK_INSUFFICIENT_STOCK', message: 'Tồn xe nguồn vừa thay đổi', details: { productId: item.productId } });
        const destination = await this.model.updateOne({ _id: context.destinationTruck._id, inventory: { $elemMatch: { productId: item.productId } } }, { $inc: { 'inventory.$.qty': item.qty } }, { session }); if (destination.modifiedCount !== 1) await this.model.updateOne({ _id: context.destinationTruck._id }, { $push: { inventory: { productId: item.productId, qty: item.qty } } }, { session });
      }
      await this.model.updateOne({ _id: context.sourceTruck._id }, { $pull: { inventory: { qty: { $lte: 0 } } } }, { session });
      const transfer: any = (await this.transferModel.create([{ code, type: TruckTransferType.TRUCK_TO_TRUCK, truckId: context.sourceTruck._id, truckCode: context.sourceTruck.code, truckName: context.sourceTruck.name, truckLicensePlate: context.sourceTruck.licensePlate, sourceTruckId: context.sourceTruck._id, sourceTruckCode: context.sourceTruck.code, sourceTruckName: context.sourceTruck.name, sourceTruckLicensePlate: context.sourceTruck.licensePlate, sourceDriverId: context.sourceDriver?._id, sourceDriverCode: context.sourceDriver?.employeeCode, sourceDriverName: context.sourceDriver?.fullName || context.sourceTruck.driverName, sourceDriverPhone: context.sourceDriver?.phone || context.sourceTruck.driverPhone, destinationTruckId: context.destinationTruck._id, destinationTruckCode: context.destinationTruck.code, destinationTruckName: context.destinationTruck.name, destinationTruckLicensePlate: context.destinationTruck.licensePlate, destinationDriverId: context.destinationDriver._id, destinationDriverCode: context.destinationDriver.employeeCode, destinationDriverName: context.destinationDriver.fullName || context.destinationTruck.driverName, destinationDriverPhone: context.destinationDriver.phone || context.destinationTruck.driverPhone, date: context.date, note: dto.note?.trim(), items: context.snapshots, totalQuantity: context.snapshots.reduce((sum, item) => sum + item.qty, 0), totalValue: context.snapshots.reduce((sum, item) => sum + item.totalValue, 0), createdBy: createdBy || undefined, reversalOf: reversalOf || undefined }], { session }))[0];
      const [sourceUpdated, destinationUpdated]: any[] = await Promise.all([this.model.findById(context.sourceTruck._id).session(session).lean(), this.model.findById(context.destinationTruck._id).session(session).lean()]); const products = await this.productMapFor([sourceUpdated, destinationUpdated]); const drivers = await this.driverMapFor([sourceUpdated, destinationUpdated]); result = { data: { transfer: this.mapTransfer(transfer.toObject()), sourceTruck: this.mapTruck(sourceUpdated, products, false, drivers), destinationTruck: this.mapTruck(destinationUpdated, products, false, drivers) } };
    }); return result; } finally { await session.endSession(); }
  }

  async reverseTruckTransfer(id: string, dto: ReverseTruckTransferDto, createdBy?: string): Promise<any> {
    const original: any = await this.transferModel.findOne({ _id: id, type: TruckTransferType.TRUCK_TO_TRUCK, isDeleted: false }).lean(); if (!original) throw new NotFoundException('Không tìm thấy phiếu chuyển xe');
    return this.transferBetweenTrucks(String(original.destinationTruckId), { destinationTruckId: String(original.sourceTruckId), date: dto.date, note: dto.note || `Đảo phiếu ${original.code}`, items: original.items.map((item) => ({ productId: String(item.productId), qty: item.qty })) }, createdBy, String(original._id));
  }

  private async moveGoods(truckId: string, dto: LoadGoodsDto, type: TruckTransferType, createdBy?: string): Promise<any> {
    const items = this.mergedItems(dto.items); const code = this.transferCode(type, dto.code); const date = dto.date ? new Date(dto.date) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Ngày chứng từ không hợp lệ');
    const session = await this.connection.startSession(); let result: any;
    try {
      await session.withTransaction(async () => {
        const truck: any = await this.model.findOne({ _id: truckId, isDeleted: false }).session(session);
        if (!truck) throw new NotFoundException('Không tìm thấy xe tải');
        if (type === TruckTransferType.LOAD && truck.status !== TruckStatus.ACTIVE) throw new ConflictException('Xe ngừng hoạt động không thể nhận hàng');
        const driver: any = truck.driverId
          ? await this.userModel.findOne({ _id: truck.driverId, isDeleted: false }).select('employeeCode fullName phone role status').session(session).lean()
          : null;
        if (type === TruckTransferType.LOAD && (!driver || driver.role !== RoleEnum.STAFF || driver.status !== UserStatus.ACTIVE)) {
          throw new ConflictException('Tài xế của xe không còn hoạt động hoặc chưa được phân công, vui lòng phân công lại');
        }
        if (await this.transferModel.exists({ code }).session(session)) throw new ConflictException('Mã phiếu điều chuyển đã tồn tại');
        const snapshots: any[] = []; const movementInputs: any[] = [];
        for (const item of items) {
          if (type === TruckTransferType.LOAD) {
            const product: any = await this.productModel.findOneAndUpdate(
              { _id: item.productId, isDeleted: false, stock: { $gte: item.qty } },
              { $inc: { stock: -item.qty } }, { new: false, session },
            );
            if (!product) {
              const available = await this.productModel.findById(item.productId).select('stock').session(session).lean();
              throw new ConflictException({ code: 'INSUFFICIENT_STOCK', message: 'Số lượng tồn kho không đủ', details: { productId: item.productId, availableQuantity: available?.stock || 0, requestedQuantity: item.qty } });
            }
            const updated = await this.model.updateOne({ _id: truckId, inventory: { $elemMatch: { productId: item.productId } } }, { $inc: { 'inventory.$.qty': item.qty } }, { session });
            if (!updated.modifiedCount) await this.model.updateOne({ _id: truckId }, { $push: { inventory: { productId: item.productId, qty: item.qty } } }, { session });
            snapshots.push({ productId: item.productId, productCode: product.code, productName: product.name, unit: product.unit || '', qty: item.qty, unitCost: product.costPrice || 0, totalValue: item.qty * (product.costPrice || 0) });
            movementInputs.push({ productId: item.productId, type: InventoryMovementType.TRANSFER_TO_TRUCK, quantityChange: -item.qty, quantityBefore: product.stock, quantityAfter: product.stock - item.qty, sourceType: InventoryLocationType.WAREHOUSE, destinationType: InventoryLocationType.TRUCK, destinationTruckId: truckId });
          } else {
            const beforeTruck: any = await this.model.findOneAndUpdate(
              { _id: truckId, inventory: { $elemMatch: { productId: item.productId, qty: { $gte: item.qty } } } },
              { $inc: { 'inventory.$.qty': -item.qty } }, { new: false, session },
            );
            if (!beforeTruck) {
              const current: any = await this.model.findById(truckId).session(session).lean(); const available = current?.inventory?.find((entry) => String(entry.productId) === item.productId)?.qty || 0;
              throw new ConflictException({ code: 'INSUFFICIENT_TRUCK_STOCK', message: 'Số lượng hàng trên xe không đủ', details: { truckId, productId: item.productId, availableQuantity: available, requestedQuantity: item.qty } });
            }
            const product: any = await this.productModel.findOneAndUpdate({ _id: item.productId, isDeleted: false }, { $inc: { stock: item.qty } }, { new: false, session });
            if (!product) throw new BadRequestException(`Sản phẩm ${item.productId} không tồn tại`);
            snapshots.push({ productId: item.productId, productCode: product.code, productName: product.name, unit: product.unit || '', qty: item.qty, unitCost: product.costPrice || 0, totalValue: item.qty * (product.costPrice || 0) });
            movementInputs.push({ productId: item.productId, type: InventoryMovementType.RETURN_FROM_TRUCK, quantityChange: item.qty, quantityBefore: product.stock, quantityAfter: product.stock + item.qty, sourceType: InventoryLocationType.TRUCK, sourceTruckId: truckId, destinationType: InventoryLocationType.WAREHOUSE });
          }
        }
        if (type === TruckTransferType.RETURN) await this.model.updateOne({ _id: truckId }, { $pull: { inventory: { qty: { $lte: 0 } } } }, { session });
        const totalQuantity = snapshots.reduce((sum, item) => sum + item.qty, 0); const totalValue = snapshots.reduce((sum, item) => sum + item.qty * item.unitCost, 0);
        const transfer: any = (await this.transferModel.create([{
          code, type, truckId, truckCode: truck.code, truckName: truck.name, truckLicensePlate: truck.licensePlate,
          driverId: truck.driverId || undefined,
          driverCode: driver?.employeeCode,
          driverName: truck.driverName || driver?.fullName || truck.driver,
          driverPhone: truck.driverPhone || driver?.phone || truck.phone,
          date, note: dto.note, items: snapshots, totalQuantity, totalValue, createdBy: createdBy || undefined,
        }], { session }))[0];
        await this.movements.recordMany(movementInputs.map((movement) => ({ ...movement, referenceType: type === TruckTransferType.LOAD ? 'TRUCK_LOAD' : 'TRUCK_RETURN', referenceId: String(transfer._id), referenceCode: code })), session);
        const updatedTruck: any = await this.model.findById(truckId).session(session).lean(); const products = await this.productMapFor([updatedTruck]);
        result = { data: { transfer: this.mapTransfer(transfer.toObject()), truck: this.mapTruck(updatedTruck, products) } };
      });
      return result;
    } finally { await session.endSession(); }
  }

  private mapTransfer(transfer: any) {
    const creator = transfer.createdBy;
    const truckSnapshot = (prefix: 'source' | 'destination') => transfer[`${prefix}TruckId`] ? { id: String(transfer[`${prefix}TruckId`]), code: transfer[`${prefix}TruckCode`], name: transfer[`${prefix}TruckName`], licensePlate: transfer[`${prefix}TruckLicensePlate`], driver: transfer[`${prefix}DriverId`] || transfer[`${prefix}DriverName`] ? { id: transfer[`${prefix}DriverId`] ? String(transfer[`${prefix}DriverId`]) : null, employeeCode: transfer[`${prefix}DriverCode`], fullName: transfer[`${prefix}DriverName`], phone: transfer[`${prefix}DriverPhone`] } : null } : null;
    return { id: String(transfer._id), code: transfer.code, type: transfer.type, date: transfer.date, truck: { id: String(transfer.truckId), code: transfer.truckCode, name: transfer.truckName, licensePlate: transfer.truckLicensePlate }, sourceTruck: truckSnapshot('source'), destinationTruck: truckSnapshot('destination'), driver: transfer.driverId || transfer.driverName ? { id: transfer.driverId ? String(transfer.driverId) : null, employeeCode: transfer.driverCode, fullName: transfer.driverName, phone: transfer.driverPhone } : null, totalQuantity: transfer.totalQuantity, totalValue: transfer.totalValue, note: transfer.note, reversalOf: transfer.reversalOf ? String(transfer.reversalOf) : null, items: (transfer.items || []).map((item) => ({ productId: String(item.productId), productCode: item.productCode, productName: item.productName, unit: item.unit || '', qty: item.qty, unitCost: item.unitCost, stockValue: item.totalValue ?? item.qty * item.unitCost })), createdBy: creator ? { id: String(creator._id || creator), fullName: creator.fullName || creator.username } : null, createdAt: transfer.createdAt };
  }

  private transferFilter(query: TruckTransferQueryDto) {
    const filter: any = { isDeleted: false };
    const expressions: any[] = [];
    if (query.truckId) { if (!Types.ObjectId.isValid(query.truckId)) throw new BadRequestException('truckId không hợp lệ'); expressions.push({ $or: [{ truckId: query.truckId }, { sourceTruckId: query.truckId }, { destinationTruckId: query.truckId }] }); }
    if (query.sourceTruckId) expressions.push({ sourceTruckId: query.sourceTruckId });
    if (query.destinationTruckId) expressions.push({ destinationTruckId: query.destinationTruckId });
    if (query.type) filter.type = query.type;
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expressions.push({ $or: ['code', 'truckCode', 'truckName', 'sourceTruckCode', 'sourceTruckName', 'sourceTruckLicensePlate', 'sourceDriverName', 'destinationTruckCode', 'destinationTruckName', 'destinationTruckLicensePlate', 'destinationDriverName', 'items.productCode', 'items.productName'].map((field) => ({ [field]: { $regex: escaped, $options: 'i' } })) });
    }
    if (query.from || query.to) {
      filter.date = {};
      if (query.from) filter.date.$gte = vietnamDateBoundary(query.from, false);
      if (query.to) filter.date.$lte = vietnamDateBoundary(query.to, true);
      if (filter.date.$gte && filter.date.$lte && filter.date.$gte > filter.date.$lte) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    }
    if (expressions.length) filter.$and = expressions;
    return filter;
  }

  async findTransfers(query: TruckTransferQueryDto): Promise<any> {
    const page = this.positiveInt(query.page, 1); const limit = this.positiveInt(query.limit, 20, 100); const filter = this.transferFilter(query);
    const [transfers, totalItems] = await Promise.all([this.transferModel.find(filter).sort({ date: -1 }).skip((page - 1) * limit).limit(limit).populate('createdBy', 'fullName username').lean(), this.transferModel.countDocuments(filter)]);
    return { data: transfers.map((transfer) => this.mapTransfer(transfer)), meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } };
  }

  async findTransfer(id: string) {
    const transfer = await this.transferModel.findOne({ _id: id, isDeleted: false }).populate('createdBy', 'fullName username').lean();
    if (!transfer) throw new NotFoundException('Không tìm thấy phiếu điều chuyển');
    return { data: this.mapTransfer(transfer) };
  }

  async transferSummary(query: TruckTransferQueryDto) {
    const transfers: any[] = await this.transferModel.find(this.transferFilter(query)).select('type truckId sourceTruckId destinationTruckId items totalQuantity totalValue').lean();
    const truckIds = new Set<string>(); const productIds = new Set<string>();
    let totalQuantity = 0; let totalValue = 0;
    for (const transfer of transfers) {
      if (transfer.truckId) truckIds.add(String(transfer.truckId)); if (transfer.sourceTruckId) truckIds.add(String(transfer.sourceTruckId)); if (transfer.destinationTruckId) truckIds.add(String(transfer.destinationTruckId)); totalQuantity += transfer.totalQuantity || 0; totalValue += transfer.totalValue || 0;
      for (const item of transfer.items || []) productIds.add(String(item.productId));
    }
    const truckToTruck = transfers.filter((transfer) => transfer.type === TruckTransferType.TRUCK_TO_TRUCK);
    return { data: { totalTransfers: transfers.length, totalQuantity, totalValue, truckCount: truckIds.size, productCount: productIds.size, truckToTruckTransfers: truckToTruck.length, truckToTruckQuantity: truckToTruck.reduce((sum, transfer) => sum + (transfer.totalQuantity || 0), 0), truckToTruckValue: truckToTruck.reduce((sum, transfer) => sum + (transfer.totalValue || 0), 0) } };
  }

  async exportTransfers(query: TruckTransferQueryDto): Promise<Buffer> {
    const transfers: any[] = await this.transferModel.find(this.transferFilter(query)).sort({ date: -1 }).populate('createdBy', 'fullName username').lean();
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Phieu dieu chuyen');
    sheet.columns = [
      { header: 'Mã phiếu', key: 'code', width: 20 }, { header: 'Loại phiếu', key: 'type', width: 14 },
      { header: 'Ngày', key: 'date', width: 22 }, { header: 'Mã xe', key: 'truckCode', width: 14 },
      { header: 'Tên xe', key: 'truckName', width: 24 }, { header: 'Biển số', key: 'licensePlate', width: 18 },
      { header: 'Mã tài xế', key: 'driverCode', width: 16 }, { header: 'Tên tài xế', key: 'driverName', width: 26 },
      { header: 'Xe nguồn', key: 'sourceTruck', width: 26 }, { header: 'Biển số xe nguồn', key: 'sourcePlate', width: 18 },
      { header: 'Tài xế giao', key: 'sourceDriver', width: 26 }, { header: 'Xe nhận', key: 'destinationTruck', width: 26 },
      { header: 'Biển số xe nhận', key: 'destinationPlate', width: 18 }, { header: 'Tài xế nhận', key: 'destinationDriver', width: 26 },
      { header: 'Mã sản phẩm', key: 'productCode', width: 18 }, { header: 'Tên sản phẩm', key: 'productName', width: 30 },
      { header: 'Đơn vị', key: 'unit', width: 12 }, { header: 'Số lượng', key: 'qty', width: 14 },
      { header: 'Giá vốn', key: 'unitCost', width: 16 }, { header: 'Thành tiền', key: 'stockValue', width: 18 },
      { header: 'Người tạo', key: 'createdBy', width: 24 }, { header: 'Ghi chú', key: 'note', width: 32 },
    ];
    for (const transfer of transfers) {
      for (const item of transfer.items || []) sheet.addRow({
        code: transfer.code, type: transfer.type, date: transfer.date, truckCode: transfer.truckCode, truckName: transfer.truckName,
        licensePlate: transfer.truckLicensePlate || '', driverCode: transfer.driverCode || '', driverName: transfer.driverName || '',
        sourceTruck: [transfer.sourceTruckCode, transfer.sourceTruckName].filter(Boolean).join(' - '), sourcePlate: transfer.sourceTruckLicensePlate || '', sourceDriver: transfer.sourceDriverName || '',
        destinationTruck: [transfer.destinationTruckCode, transfer.destinationTruckName].filter(Boolean).join(' - '), destinationPlate: transfer.destinationTruckLicensePlate || '', destinationDriver: transfer.destinationDriverName || '',
        productCode: item.productCode, productName: item.productName, unit: item.unit || '', qty: item.qty, unitCost: item.unitCost,
        stockValue: item.qty * item.unitCost, createdBy: transfer.createdBy?.fullName || transfer.createdBy?.username || '', note: transfer.note || '',
      });
    }
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }]; sheet.autoFilter = { from: 'A1', to: 'V1' };
    sheet.getColumn('date').numFmt = 'dd/mm/yyyy hh:mm'; ['qty', 'unitCost', 'stockValue'].forEach((column) => { sheet.getColumn(column).numFmt = '#,##0'; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
