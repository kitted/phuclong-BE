import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Invoices } from './schemas/invoices.schema';
import { Products } from '../products/schemas/products.schema';
import { Trucks } from '../trucks/schemas/trucks.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import { CreateInvoiceDto } from './dtos/invoices.dto';
import { ID } from 'src/core/interfaces/id.interface';
import { InventoryMovementsService } from '../inventory/inventory-movements.service';
import { InventoryLocationType, InventoryMovementType } from '../inventory/schemas/inventory-movement.schema';
import { Customers } from '../customers/schemas/customers.schema';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoices)
    private readonly model: ReturnModelType<typeof Invoices>,
    @InjectModel(Products)
    private readonly productModel: ReturnModelType<typeof Products>,
    @InjectModel(Trucks)
    private readonly truckModel: ReturnModelType<typeof Trucks>,
    private readonly movements: InventoryMovementsService,
    @InjectModel(Customers)
    private readonly customerModel: ReturnModelType<typeof Customers>,
  ) {}

  async create(dto: CreateInvoiceDto) {
    const existing = await this.model.findOne({ code: dto.code, isDeleted: false });
    if (existing) throw new BadRequestException('Mã hóa đơn đã tồn tại');

    if (dto.sourceType === 'truck' && !dto.truckId) {
      throw new BadRequestException('Phải chọn xe tải khi xuất từ xe');
    }

    if (dto.customerId && !await this.customerModel.exists({ _id: dto.customerId, isDeleted: false })) {
      throw new BadRequestException('Khách hàng không tồn tại');
    }
    const paidAmount = Number(dto.paidAmount) || 0;
    if (paidAmount < 0 || paidAmount > dto.totalAmount) {
      throw new BadRequestException('Số tiền đã thanh toán không hợp lệ');
    }

    // 1. Validate stock
    if (dto.sourceType === 'warehouse') {
      for (const item of dto.items) {
        const p = await this.productModel.findOne({ _id: item.productId, isDeleted: false });
        if (!p) throw new BadRequestException(`Sản phẩm ${item.productId} không tồn tại`);
        if (p.stock < item.qty) {
          throw new BadRequestException(`Sản phẩm ${p.name} không đủ tồn kho (còn ${p.stock})`);
        }
      }
    } else if (dto.sourceType === 'truck') {
      const truck = await this.truckModel.findOne({ _id: dto.truckId, isDeleted: false });
      if (!truck) throw new NotFoundException('Không tìm thấy xe tải');

      for (const item of dto.items) {
        const inv = truck.inventory.find(i => i.productId.toString() === item.productId);
        if (!inv || inv.qty < item.qty) {
          throw new BadRequestException(`Sản phẩm ${item.productId} không đủ số lượng trên xe`);
        }
      }
    }

    const paymentStatus = paidAmount >= dto.totalAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
    const created = await this.model.create({ ...dto, paidAmount, paymentStatus });

    // 2. Process stock deduction
    if (dto.sourceType === 'warehouse') {
      for (const item of dto.items) {
        const product = await this.productModel.findById(item.productId).lean();
        const before = product?.stock || 0;
        await this.productModel.updateOne(
          { _id: item.productId },
          { $inc: { stock: -item.qty } }
        );
        await this.movements.record({
          productId: item.productId,
          type: InventoryMovementType.WAREHOUSE_SALE,
          quantityChange: -item.qty,
          quantityBefore: before,
          quantityAfter: before - item.qty,
          sourceType: InventoryLocationType.WAREHOUSE,
          referenceType: 'INVOICE',
          referenceId: String(created._id),
          referenceCode: created.code,
        });
      }
    } else if (dto.sourceType === 'truck') {
      const truck = await this.truckModel.findOne({ _id: dto.truckId, isDeleted: false });
      for (const item of dto.items) {
        const invIdx = truck.inventory.findIndex(i => i.productId.toString() === item.productId);
        const before = truck.inventory[invIdx].qty;
        truck.inventory[invIdx].qty -= item.qty;
        if (truck.inventory[invIdx].qty === 0) {
          truck.inventory.splice(invIdx, 1);
        }
        await this.movements.record({
          productId: item.productId,
          type: InventoryMovementType.TRUCK_SALE,
          quantityChange: -item.qty,
          quantityBefore: before,
          quantityAfter: before - item.qty,
          sourceType: InventoryLocationType.TRUCK,
          sourceTruckId: String(truck._id),
          referenceType: 'INVOICE',
          referenceId: String(created._id),
          referenceCode: created.code,
        });
      }
      await truck.save();
    }

    if (dto.customerId) {
      await this.customerModel.updateOne(
        { _id: dto.customerId, isDeleted: false },
        { $inc: { debt: dto.totalAmount - paidAmount } },
      );
    }

    return created;
  }

  async findAll() {
    return await this.model.find({ isDeleted: false })
      .populate('truckId')
      .populate('items.productId');
  }

  async findOne(id: ID | string) {
    const doc = await this.model.findOne({ _id: id, isDeleted: false })
      .populate('truckId')
      .populate('items.productId');
    if (!doc) throw new NotFoundException('Không tìm thấy hóa đơn');
    return doc;
  }
}
