import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Suppliers } from './schemas/suppliers.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import { CreateSupplierDto, UpdateSupplierDto } from './dtos/suppliers.dto';
import { ID } from 'src/core/interfaces/id.interface';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectModel(Suppliers)
    private readonly model: ReturnModelType<typeof Suppliers>,
  ) {}

  async create(dto: CreateSupplierDto) {
    return await this.model.create(dto);
  }

  async findAll() {
    return await this.model.find({ isDeleted: false }).sort({ createdAt: -1, _id: -1 });
  }

  async findOne(id: ID | string) {
    const doc = await this.model.findOne({ _id: id, isDeleted: false });
    if (!doc) throw new NotFoundException('Không tìm thấy nhà cung cấp');
    return doc;
  }

  async update(id: ID | string, dto: UpdateSupplierDto) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      dto,
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy nhà cung cấp');
    return doc;
  }

  async remove(id: ID | string) {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy nhà cung cấp');
    return doc;
  }
}
