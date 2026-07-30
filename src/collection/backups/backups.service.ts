import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Connection } from 'mongoose';
import { EJSON } from 'bson';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import * as bcrypt from 'bcrypt';
import { Users, UserStatus } from '../users/schemas/users.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import { BackupLockService } from './backup-lock.service';

type RestoreMode = 'REPLACE' | 'MERGE';
type RestoreJobStatus = 'PENDING' | 'VALIDATING' | 'CREATING_SAFETY_BACKUP' | 'RESTORING' | 'VERIFYING' | 'COMPLETED' | 'FAILED';
type RestoreJob = { id: string; status: RestoreJobStatus; progress: number; message: string; error?: string; createdAt: Date; updatedAt: Date };
type StoredBackup = { payload: any; checksumValid: boolean; expiresAt: Date };

@Injectable()
export class BackupsService {
  private readonly schemaVersion = '2.0.0';
  private readonly restoreTokens = new Map<string, StoredBackup>();
  private readonly jobs = new Map<string, RestoreJob>();
  constructor(
    @Inject(getConnectionToken()) private readonly connection: Connection,
    @InjectModel(Users) private readonly users: ReturnModelType<typeof Users>,
    private readonly lock: BackupLockService,
  ) {}

  private key(name: 'BACKUP_ENCRYPTION_KEY' | 'BACKUP_SIGNING_KEY') {
    const value = process.env[name];
    if (!value) throw new BadRequestException(`${name} chưa được cấu hình`);
    return createHash('sha256').update(value).digest();
  }
  private allowedName(name: string) {
    return /^[a-zA-Z][a-zA-Z0-9_-]{0,100}$/.test(name) && !name.startsWith('system.') && !name.includes('__restore_') && !name.includes('__before_');
  }
  private async collectionNames(includeAuditLogs = true) {
    const rows = await this.connection.db.listCollections({}, { nameOnly: true }).toArray();
    return rows.map((row) => row.name).filter((name) => this.allowedName(name) && (includeAuditLogs || name !== 'auditlogs')).sort();
  }
  private async snapshot(includeAuditLogs = true) {
    const names = await this.collectionNames(includeAuditLogs);
    const collections: Record<string, any[]> = {};
    const indexes: Record<string, any[]> = {};
    for (const name of names) {
      collections[name] = await this.connection.db.collection(name).find({}).toArray();
      indexes[name] = (await this.connection.db.collection(name).indexes()).filter((index) => index.name !== '_id_');
    }
    const createdAt = new Date();
    return {
      manifest: { schemaVersion: this.schemaVersion, createdAt, format: 'EJSON_GZIP_AES_256_GCM', includeAuditLogs, collections: names.map((name) => ({ name, documents: collections[name].length, indexes: indexes[name] })), warnings: ['Ảnh Cloudinary không nằm trong file backup database.'] },
      collections,
    };
  }
  private encode(payload: any) {
    const plain = gzipSync(Buffer.from(EJSON.stringify(payload, { relaxed: false }), 'utf8'));
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key('BACKUP_ENCRYPTION_KEY'), iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]); const tag = cipher.getAuthTag();
    const signed = Buffer.concat([iv, tag, encrypted]); const signature = createHmac('sha256', this.key('BACKUP_SIGNING_KEY')).update(signed).digest();
    return Buffer.concat([Buffer.from('PLBACKUP2'), signature, signed]);
  }
  private decode(file: Buffer) {
    if (!file || file.length < 69 || file.subarray(0, 9).toString() !== 'PLBACKUP2') throw new BadRequestException('File backup không đúng định dạng');
    const signature = file.subarray(9, 41); const signed = file.subarray(41);
    const expected = createHmac('sha256', this.key('BACKUP_SIGNING_KEY')).update(signed).digest();
    if (!timingSafeEqual(signature, expected)) throw new BadRequestException({ code: 'BACKUP_CHECKSUM_INVALID', message: 'Chữ ký hoặc checksum file backup không hợp lệ' });
    const iv = signed.subarray(0, 12), tag = signed.subarray(12, 28), encrypted = signed.subarray(28);
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key('BACKUP_ENCRYPTION_KEY'), iv); decipher.setAuthTag(tag);
      return EJSON.parse(gunzipSync(Buffer.concat([decipher.update(encrypted), decipher.final()]), { maxOutputLength: 1024 * 1024 * 1024 }).toString('utf8'));
    } catch {
      throw new BadRequestException('Không thể giải mã file backup');
    }
  }
  async export(includeAuditLogs = true) { return this.encode(await this.snapshot(includeAuditLogs)); }
  async inspect(file: Buffer) {
    const payload: any = this.decode(file);
    if (!payload?.manifest || !payload?.collections || payload.manifest.schemaVersion !== this.schemaVersion) throw new BadRequestException({ code: 'BACKUP_SCHEMA_VERSION_UNSUPPORTED', message: 'Phiên bản schema backup không được hỗ trợ' });
    const names = Object.keys(payload.collections);
    if (names.some((name) => !this.allowedName(name))) throw new BadRequestException('File chứa collection không được phép');
    const allowedCollections = new Set(await this.collectionNames(true));
    if (names.some((name) => !allowedCollections.has(name))) throw new BadRequestException('File chứa collection ngoài allowlist của ứng dụng');
    for (const item of payload.manifest.collections || []) if (!Array.isArray(payload.collections[item.name]) || payload.collections[item.name].length !== item.documents) throw new BadRequestException('Số lượng document trong manifest không khớp');
    const restoreToken = randomUUID(), expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    this.restoreTokens.set(restoreToken, { payload, checksumValid: true, expiresAt });
    const expiryTimer = setTimeout(() => this.restoreTokens.delete(restoreToken), 60 * 60 * 1000);
    expiryTimer.unref();
    return { data: { restoreToken, checksumValid: true, createdAt: payload.manifest.createdAt, schemaVersion: payload.manifest.schemaVersion, expiresAt, collections: payload.manifest.collections.map((item) => ({ name: item.name, documents: item.documents })), warnings: payload.manifest.warnings || [] } };
  }
  private async verifyAdmin(actorId: string, password: string) {
    const admin: any = await this.users.findOne({ _id: actorId, role: RoleEnum.ADMIN, status: { $ne: UserStatus.INACTIVE }, isDeleted: false }).select('+password').lean();
    if (!admin || !password || !await bcrypt.compare(password, admin.password)) throw new ForbiddenException('Mật khẩu quản trị viên không chính xác');
  }
  async startRestore(token: string, dto: any, actorId: string) {
    const stored = this.restoreTokens.get(token);
    if (!stored || stored.expiresAt <= new Date()) { this.restoreTokens.delete(token); throw new NotFoundException('Restore token không tồn tại hoặc đã hết hạn'); }
    if (!['REPLACE', 'MERGE'].includes(dto.mode)) throw new BadRequestException('Chế độ restore không hợp lệ');
    if (dto.confirmation !== 'KHOI PHUC DU LIEU') throw new BadRequestException('Chuỗi xác nhận không chính xác');
    await this.verifyAdmin(actorId, dto.currentPassword);
    if ([...this.jobs.values()].some((job) => !['COMPLETED', 'FAILED'].includes(job.status))) throw new ConflictException('Một tiến trình restore khác đang chạy');
    const job: RestoreJob = { id: randomUUID(), status: 'PENDING', progress: 0, message: 'Đang chờ xử lý', createdAt: new Date(), updatedAt: new Date() };
    this.jobs.set(job.id, job); this.restoreTokens.delete(token);
    setImmediate(() => this.run(job, stored.payload, dto.mode, dto.createSafetyBackup !== false).catch(() => undefined));
    return { data: { jobId: job.id, status: job.status, progress: job.progress } };
  }
  getJob(id: string) { const job = this.jobs.get(id); if (!job) throw new NotFoundException('Không tìm thấy tiến trình restore'); return { data: job }; }
  private update(job: RestoreJob, status: RestoreJobStatus, progress: number, message: string) { Object.assign(job, { status, progress, message, updatedAt: new Date() }); }
  private async run(job: RestoreJob, payload: any, mode: RestoreMode, safety: boolean) {
    if (!this.lock.lock()) { this.update(job, 'FAILED', 0, 'Hệ thống đang bị khóa bởi tiến trình khác'); return; }
    const suffix = `${Date.now()}_${job.id.replace(/-/g, '')}`;
    try {
      this.update(job, 'VALIDATING', 5, 'Đang kiểm tra dữ liệu');
      const entries = Object.entries(payload.collections) as Array<[string, any[]]>;
      if (safety) {
        this.update(job, 'CREATING_SAFETY_BACKUP', 10, 'Đang tạo bản sao lưu an toàn');
        const safetyFile = this.encode(await this.snapshot(true));
        await import('fs/promises').then((fs) => fs.writeFile(`/tmp/phuclong-safety-${job.id}.plbackup`, safetyFile, { mode: 0o600 }));
      }
      this.update(job, 'RESTORING', 15, 'Đang khôi phục dữ liệu');
      if (mode === 'MERGE') {
        for (let i = 0; i < entries.length; i++) {
          const [name, docs] = entries[i];
          for (let offset = 0; offset < docs.length; offset += 500) {
            const batch = docs.slice(offset, offset + 500);
            if (batch.length) await this.connection.db.collection(name).bulkWrite(batch.map((document) => {
              const { _id, ...fields } = document;
              return { updateOne: { filter: { _id }, update: { $set: fields, $setOnInsert: { _id } }, upsert: true } };
            }), { ordered: false });
          }
          this.update(job, 'RESTORING', 15 + Math.round((i + 1) / entries.length * 70), `Đang khôi phục ${name}`);
        }
      } else {
        const staged: Array<{ name: string; staging: string; before: string }> = [];
        for (let i = 0; i < entries.length; i++) {
          const [name, docs] = entries[i], staging = `${name}__restore_${suffix}`, before = `${name}__before_${suffix}`;
          const collection = this.connection.db.collection(staging); if (docs.length) await collection.insertMany(docs, { ordered: false }); else await this.connection.db.createCollection(staging);
          const manifestEntry = (payload.manifest.collections || []).find((item) => item.name === name);
          for (const index of manifestEntry?.indexes || []) {
            const { key, name: indexName, v, ns, background, ...options } = index;
            await collection.createIndex(key, { ...options, name: indexName });
          }
          if (await collection.countDocuments() !== docs.length) throw new Error(`Sai số lượng document tại ${name}`);
          staged.push({ name, staging, before }); this.update(job, 'RESTORING', 15 + Math.round((i + 1) / entries.length * 55), `Đang dựng staging ${name}`);
        }
        const swapped: typeof staged = [];
        try {
          const existing = new Set((await this.connection.db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
          for (const item of staged) {
            if (existing.has(item.name)) await this.connection.db.collection(item.name).rename(item.before);
            await this.connection.db.collection(item.staging).rename(item.name);
            swapped.push(item);
          }
        } catch (error) {
          for (const item of swapped.reverse()) {
            await this.connection.db.collection(item.name).rename(`${item.staging}_failed`).catch(() => undefined);
            await this.connection.db.collection(item.before).rename(item.name).catch(() => undefined);
          }
          throw error;
        }
        for (const item of swapped) await this.connection.db.dropCollection(item.before).catch(() => undefined);
      }
      this.update(job, 'VERIFYING', 92, 'Đang xác minh kết quả');
      for (const [name, docs] of entries) if (mode === 'REPLACE' && await this.connection.db.collection(name).countDocuments() !== docs.length) throw new Error(`Xác minh thất bại tại ${name}`);
      await this.connection.db.collection('auditlogs').insertOne({
        correlationId: randomUUID(), occurredAt: new Date(), action: 'OTHER', status: 'SUCCESS', authenticated: true,
        method: 'BACKGROUND', path: '/admin/backups/restore', resource: 'backups', entityId: job.id,
        description: `Khôi phục dữ liệu ${mode} hoàn tất`, changedFields: Object.keys(payload.collections),
        httpStatus: 200, durationMs: 0, isDeleted: false, createdAt: new Date(), updatedAt: new Date(),
      }).catch(() => undefined);
      this.update(job, 'COMPLETED', 100, 'Khôi phục dữ liệu thành công');
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error); this.update(job, 'FAILED', job.progress, 'Khôi phục dữ liệu thất bại');
    } finally { this.lock.unlock(); }
  }
}
