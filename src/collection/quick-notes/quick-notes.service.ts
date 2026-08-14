import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { RoleEnum } from '../users/interfaces/role.enum';
import { QuickNotes } from './schemas/quick-notes.schema';
import {
  CreateQuickNoteDto,
  QuickNoteQueryDto,
  UpdateQuickNoteDto,
} from './dtos/quick-notes.dto';

type QuickNoteActor = { id: string; role: RoleEnum };

@Injectable()
export class QuickNotesService {
  constructor(
    @InjectModel(QuickNotes)
    private readonly model: ReturnModelType<typeof QuickNotes>,
  ) {}

  private visibleFilter(actor: QuickNoteActor): any {
    if (actor.role === RoleEnum.ADMIN) return {};
    return {
      isActive: true,
      $or: [
        { targetUserIds: { $size: 0 } },
        { targetUserIds: actor.id },
        { targetUserIds: { $exists: false } },
      ],
    };
  }

  async create(dto: CreateQuickNoteDto, actorId: string): Promise<any> {
    const isPinned = dto.isPinned === true;
    const doc = await this.model.create({
      ...dto,
      title: dto.title.trim(),
      content: dto.content.trim(),
      targetUserIds: dto.targetUserIds || [],
      isPinned,
      pinnedAt: isPinned ? new Date() : undefined,
      createdBy: actorId,
    });
    return { data: doc };
  }

  async findAll(q: QuickNoteQueryDto, actor: QuickNoteActor): Promise<any> {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const filter: any = { isDeleted: false, ...this.visibleFilter(actor) };
    if (q.isActive !== undefined) filter.isActive = q.isActive;
    if (q.isPinned !== undefined) filter.isPinned = q.isPinned;
    if (q.search?.trim()) {
      const escaped = q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$and = [{ $or: [{ title: new RegExp(escaped, 'i') }, { content: new RegExp(escaped, 'i') }] }];
    }
    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ isPinned: -1, pinnedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async latestPinned(actor: QuickNoteActor): Promise<any> {
    const doc = await this.model
      .findOne({ isDeleted: false, isPinned: true, ...this.visibleFilter(actor) })
      .sort({ pinnedAt: -1, createdAt: -1 })
      .lean();
    return { data: doc || null };
  }

  async findOne(id: string, actor: QuickNoteActor): Promise<any> {
    const doc = await this.model
      .findOne({ _id: id, isDeleted: false, ...this.visibleFilter(actor) })
      .lean();
    if (!doc) throw new NotFoundException('Không tìm thấy note');
    return { data: doc };
  }

  async update(id: string, dto: UpdateQuickNoteDto, actorId: string): Promise<any> {
    const changes: any = { ...dto, updatedBy: actorId };
    if (dto.title !== undefined) changes.title = dto.title.trim();
    if (dto.content !== undefined) changes.content = dto.content.trim();
    if (dto.isPinned !== undefined) changes.pinnedAt = dto.isPinned ? new Date() : null;
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: changes },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy note');
    return { data: doc };
  }

  async remove(id: string, actorId: string): Promise<any> {
    const doc = await this.model.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), updatedBy: actorId } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Không tìm thấy note');
    return { data: { id, deleted: true } };
  }
}
