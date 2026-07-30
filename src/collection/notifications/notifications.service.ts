import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Observable, Subject, filter, map } from 'rxjs';
import { NotificationType, Notifications } from './schemas/notifications.schema';
import { RoleEnum } from '../users/interfaces/role.enum';

type Actor = { id?: string; role?: RoleEnum };
type CreateNotification = { type: NotificationType; title: string; message: string; entityType?: string; entityId?: string; entityCode?: string; data?: Record<string, unknown>; staffRecipientId?: string };

@Injectable()
export class NotificationsService {
  private readonly events = new Subject<any>();
  constructor(@InjectModel(Notifications) private readonly model: ReturnModelType<typeof Notifications>) {}
  private scope(actor: Actor) { return actor.role === RoleEnum.ADMIN ? { audience: 'ADMIN' } : { audience: 'STAFF', recipientId: actor.id }; }
  async create(input: CreateNotification) {
    const docs: any[] = [await this.model.create({ ...input, audience: 'ADMIN' })];
    if (input.staffRecipientId) docs.push(await this.model.create({ ...input, audience: 'STAFF', recipientId: input.staffRecipientId }));
    docs.forEach((doc) => this.events.next(doc.toObject ? doc.toObject() : doc));
    return docs;
  }
  async findAll(actor: Actor, query: any = {}): Promise<any> {
    const page = Math.max(1, Number(query.page) || 1), limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const filterValue: any = { isDeleted: false, ...this.scope(actor) };
    if (query.unread === true || query.unread === 'true') filterValue.readAt = { $exists: false };
    const [data, total] = await Promise.all([this.model.find(filterValue).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), this.model.countDocuments(filterValue)]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
  async summary(actor: Actor) {
    const base = { isDeleted: false, ...this.scope(actor) };
    const [total, unread] = await Promise.all([this.model.countDocuments(base), this.model.countDocuments({ ...base, readAt: { $exists: false } })]);
    return { data: { total, unread } };
  }
  async read(id: string, actor: Actor) {
    const doc = await this.model.findOneAndUpdate({ _id: id, isDeleted: false, ...this.scope(actor) }, { $set: { readAt: new Date() } }, { new: true });
    if (!doc) throw new NotFoundException('Không tìm thấy thông báo');
    return { data: doc };
  }
  async readAll(actor: Actor) {
    const result = await this.model.updateMany({ isDeleted: false, readAt: { $exists: false }, ...this.scope(actor) }, { $set: { readAt: new Date() } });
    return { data: { updated: result.modifiedCount } };
  }
  stream(actor: Actor): Observable<MessageEvent> {
    return this.events.pipe(filter((item) => item.audience === (actor.role === RoleEnum.ADMIN ? 'ADMIN' : 'STAFF') && (actor.role === RoleEnum.ADMIN || String(item.recipientId) === actor.id)), map((item) => ({ data: item }) as MessageEvent));
  }
}
