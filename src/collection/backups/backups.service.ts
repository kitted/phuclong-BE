import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getConnectionToken, InjectModel } from 'nestjs-typegoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { Connection } from 'mongoose';
import { GridFSBucket, ObjectId } from 'mongodb';
import { EJSON } from 'bson';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import * as bcrypt from 'bcrypt';
import { Users, UserStatus } from '../users/schemas/users.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import { BackupLockService } from './backup-lock.service';

type RestoreMode = 'REPLACE' | 'MERGE';
type RestoreJobStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'CREATING_SAFETY_BACKUP'
  | 'RESTORING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED';
type RestoreJob = {
  id: string;
  status: RestoreJobStatus;
  progress: number;
  message: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  snapshotId?: string;
  actorId?: string;
};
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

  private backupDb() {
    return this.connection
      .getClient()
      .db(process.env.BACKUP_DATABASE || 'phuclong_backups');
  }
  private bucket() {
    return new GridFSBucket(this.backupDb(), {
      bucketName: 'system_snapshots',
    });
  }
  private metadata() {
    return this.backupDb().collection('snapshot_metadata');
  }
  private jobCollection() {
    return this.backupDb().collection('restore_jobs');
  }
  private async acquireDistributedRestoreLock(owner: string) {
    try {
      const result = await this.backupDb()
        .collection<{ _id: string; owner?: string; lockedUntil?: Date }>(
          'locks',
        )
        .findOneAndUpdate(
          {
            _id: 'GLOBAL_RESTORE',
            $or: [
              { lockedUntil: { $lt: new Date() } },
              { lockedUntil: { $exists: false } },
            ],
          },
          {
            $set: {
              owner,
              lockedUntil: new Date(Date.now() + 6 * 60 * 60 * 1000),
            },
          },
          { upsert: true, returnDocument: 'after' },
        );
      return result?.owner === owner;
    } catch (error: any) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }
  private async releaseDistributedRestoreLock(owner: string) {
    await this.backupDb()
      .collection('locks')
      .updateOne({ _id: 'GLOBAL_RESTORE', owner } as any, {
        $unset: { owner: '', lockedUntil: '' },
      })
      .catch(() => undefined);
  }
  private async assertSnapshotMutationAvailable() {
    const active = await this.backupDb()
      .collection('locks')
      .findOne({
        _id: 'GLOBAL_RESTORE',
        lockedUntil: { $gt: new Date() },
      } as any);
    if (this.lock.isLocked() || active)
      throw new ConflictException(
        'Không thể thay đổi kho backup khi đang khôi phục dữ liệu',
      );
  }

  private key(name: 'BACKUP_ENCRYPTION_KEY' | 'BACKUP_SIGNING_KEY') {
    const value = process.env[name];
    if (!value) throw new BadRequestException(`${name} chưa được cấu hình`);
    return createHash('sha256').update(value).digest();
  }
  private allowedName(name: string) {
    return (
      /^[a-zA-Z][a-zA-Z0-9_-]{0,100}$/.test(name) &&
      !name.startsWith('system.') &&
      !name.includes('__restore_') &&
      !name.includes('__before_')
    );
  }
  private async collectionNames(includeAuditLogs = true) {
    const rows = await this.connection.db
      .listCollections({}, { nameOnly: true })
      .toArray();
    return rows
      .map((row) => row.name)
      .filter(
        (name) =>
          this.allowedName(name) && (includeAuditLogs || name !== 'auditlogs'),
      )
      .sort();
  }
  private async snapshot(includeAuditLogs = true) {
    const names = await this.collectionNames(includeAuditLogs);
    const collections: Record<string, any[]> = {};
    const indexes: Record<string, any[]> = {};
    for (const name of names) {
      collections[name] = await this.connection.db
        .collection(name)
        .find({})
        .toArray();
      indexes[name] = (
        await this.connection.db.collection(name).indexes()
      ).filter((index) => index.name !== '_id_');
    }
    const createdAt = new Date();
    return {
      manifest: {
        schemaVersion: this.schemaVersion,
        createdAt,
        format: 'EJSON_GZIP_AES_256_GCM',
        includeAuditLogs,
        collections: names.map((name) => ({
          name,
          documents: collections[name].length,
          indexes: indexes[name],
        })),
        warnings: ['Ảnh Cloudinary không nằm trong file backup database.'],
      },
      collections,
    };
  }
  private encode(payload: any) {
    const plain = gzipSync(
      Buffer.from(EJSON.stringify(payload, { relaxed: false }), 'utf8'),
    );
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.key('BACKUP_ENCRYPTION_KEY'),
      iv,
    );
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    const signed = Buffer.concat([iv, tag, encrypted]);
    const signature = createHmac('sha256', this.key('BACKUP_SIGNING_KEY'))
      .update(signed)
      .digest();
    return Buffer.concat([Buffer.from('PLBACKUP2'), signature, signed]);
  }
  private decode(file: Buffer) {
    if (
      !file ||
      file.length < 69 ||
      file.subarray(0, 9).toString() !== 'PLBACKUP2'
    )
      throw new BadRequestException('File backup không đúng định dạng');
    const signature = file.subarray(9, 41);
    const signed = file.subarray(41);
    const expected = createHmac('sha256', this.key('BACKUP_SIGNING_KEY'))
      .update(signed)
      .digest();
    if (!timingSafeEqual(signature, expected))
      throw new BadRequestException({
        code: 'BACKUP_CHECKSUM_INVALID',
        message: 'Chữ ký hoặc checksum file backup không hợp lệ',
      });
    const iv = signed.subarray(0, 12),
      tag = signed.subarray(12, 28),
      encrypted = signed.subarray(28);
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key('BACKUP_ENCRYPTION_KEY'),
        iv,
      );
      decipher.setAuthTag(tag);
      return EJSON.parse(
        gunzipSync(
          Buffer.concat([decipher.update(encrypted), decipher.final()]),
          { maxOutputLength: 1024 * 1024 * 1024 },
        ).toString('utf8'),
      );
    } catch {
      throw new BadRequestException('Không thể giải mã file backup');
    }
  }
  async export(includeAuditLogs = true) {
    return this.encode(await this.snapshot(includeAuditLogs));
  }

  private async nextSnapshotCode() {
    const day = new Date()
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
      .replaceAll('-', '');
    const row: any = await this.backupDb()
      .collection<{ _id: string; sequence: number }>('counters')
      .findOneAndUpdate(
        { _id: `SNAPSHOT_${day}` },
        { $inc: { sequence: 1 } },
        { upsert: true, returnDocument: 'after' },
      );
    return `BK-${day.slice(2)}-${String(row?.sequence || 1).padStart(4, '0')}`;
  }
  private async uploadFile(file: Buffer, filename: string, metadata: any) {
    return new Promise<ObjectId>((resolve, reject) => {
      const stream = this.bucket().openUploadStream(filename, { metadata });
      stream.once('error', reject);
      stream.once('finish', () => resolve(stream.id));
      stream.end(file);
    });
  }
  private async readFile(fileId: ObjectId) {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = this.bucket().openDownloadStream(fileId);
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.once('error', reject);
      stream.once('end', () => resolve(Buffer.concat(chunks)));
    });
  }
  private snapshotView(row: any) {
    return {
      id: String(row._id),
      code: row.code,
      name: row.name,
      note: row.note,
      sourceType: row.sourceType,
      status: row.status,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      sizeBytes: row.sizeBytes,
      schemaVersion: row.schemaVersion,
      collectionCount: row.collectionCount,
      documentCount: row.documentCount,
      checksum: row.checksum,
      includeAuditLogs: row.includeAuditLogs,
      restoredAt: row.restoredAt || null,
      restoreJobId: row.restoreJobId,
    };
  }
  private async storeSnapshot(input: {
    name: string;
    note?: string;
    includeAuditLogs: boolean;
    sourceType: 'MANUAL' | 'BEFORE_RESTORE';
    actorId?: string;
    actorName?: string;
  }) {
    const payload: any = await this.snapshot(input.includeAuditLogs),
      file = this.encode(payload),
      checksum = createHash('sha256').update(file).digest('hex'),
      code = await this.nextSnapshotCode(),
      now = new Date();
    const fileId = await this.uploadFile(file, `${code}.plbackup`, {
      code,
      sourceType: input.sourceType,
      schemaVersion: this.schemaVersion,
    });
    const collectionCount = payload.manifest.collections.length,
      collections = payload.manifest.collections.map((item) => ({
        name: item.name,
        documents: item.documents,
      })),
      documentCount = payload.manifest.collections.reduce(
        (sum, item) => sum + item.documents,
        0,
      );
    try {
      const result = await this.metadata().insertOne({
        code,
        name: input.name,
        note: input.note,
        sourceType: input.sourceType,
        status: 'READY',
        createdAt: now,
        updatedAt: now,
        createdBy: input.actorId,
        createdByName: input.actorName,
        sizeBytes: file.length,
        schemaVersion: this.schemaVersion,
        collectionCount,
        collections,
        documentCount,
        checksum,
        includeAuditLogs: input.includeAuditLogs,
        fileId,
      });
      return {
        ...this.snapshotView({
          _id: result.insertedId,
          code,
          name: input.name,
          note: input.note,
          sourceType: input.sourceType,
          status: 'READY',
          createdAt: now,
          createdBy: input.actorId,
          createdByName: input.actorName,
          sizeBytes: file.length,
          schemaVersion: this.schemaVersion,
          collectionCount,
          documentCount,
          checksum,
          includeAuditLogs: input.includeAuditLogs,
        }),
        fileId,
      };
    } catch (error) {
      await this.bucket()
        .delete(fileId)
        .catch(() => undefined);
      throw error;
    }
  }
  async createSnapshot(dto: any, actorId: string) {
    await this.assertSnapshotMutationAvailable();
    if (!dto?.name?.trim())
      throw new BadRequestException('Tên bản sao là bắt buộc');
    const actor: any = await this.users
      .findById(actorId)
      .select('fullName username')
      .lean();
    const data = await this.storeSnapshot({
      name: dto.name.trim(),
      note: dto.note?.trim(),
      includeAuditLogs: dto.includeAuditLogs !== false,
      sourceType: 'MANUAL',
      actorId,
      actorName: actor?.fullName || actor?.username || '',
    });
    return { data };
  }
  async listSnapshots(query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1),
      limit = Math.min(100, Math.max(1, Number(query.limit) || 20)),
      filter: any = {};
    if (query.sourceType) filter.sourceType = query.sourceType;
    if (query.status) filter.status = query.status;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from)
        filter.createdAt.$gte = new Date(`${query.from}T00:00:00+07:00`);
      if (query.to)
        filter.createdAt.$lte = new Date(`${query.to}T23:59:59.999+07:00`);
    }
    const [rows, total] = await Promise.all([
      this.metadata()
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.metadata().countDocuments(filter),
    ]);
    return {
      data: rows.map((x) => this.snapshotView(x)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  private async snapshotRecord(id: string) {
    if (!ObjectId.isValid(id))
      throw new NotFoundException('Không tìm thấy bản sao');
    const row = await this.metadata().findOne({ _id: new ObjectId(id) });
    if (!row) throw new NotFoundException('Không tìm thấy bản sao');
    return row;
  }
  async getSnapshot(id: string) {
    const row = await this.snapshotRecord(id);
    return {
      data: { ...this.snapshotView(row), collections: row.collections || [] },
    };
  }
  private async verifiedSnapshot(id: string) {
    const row: any = await this.snapshotRecord(id);
    if (row.status !== 'READY')
      throw new ConflictException('Bản sao chưa sẵn sàng');
    const file = await this.readFile(row.fileId);
    const checksum = createHash('sha256').update(file).digest('hex');
    if (checksum !== row.checksum)
      throw new BadRequestException({
        code: 'BACKUP_CHECKSUM_INVALID',
        message: 'Checksum bản sao không hợp lệ',
      });
    const payload: any = this.decode(file);
    if (
      payload?.manifest?.schemaVersion !== this.schemaVersion ||
      row.schemaVersion !== this.schemaVersion
    )
      throw new BadRequestException({
        code: 'BACKUP_SCHEMA_VERSION_UNSUPPORTED',
        message: 'Phiên bản schema backup không được hỗ trợ',
      });
    const collections = (payload.manifest.collections || []).map((x) => ({
      name: x.name,
      documents: x.documents,
    }));
    return { row, file, payload, collections };
  }
  async downloadSnapshot(id: string) {
    const { row, file } = await this.verifiedSnapshot(id);
    return { file, filename: `${row.code}.plbackup` };
  }
  async previewSnapshotRestore(id: string) {
    const { row, collections } = await this.verifiedSnapshot(id);
    const blockers: any[] = [];
    if (
      [...this.jobs.values()].some(
        (job) => !['COMPLETED', 'FAILED'].includes(job.status),
      ) ||
      (await this.jobCollection().findOne({
        status: { $nin: ['COMPLETED', 'FAILED'] },
        updatedAt: { $gt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      }))
    )
      blockers.push({
        code: 'RESTORE_IN_PROGRESS',
        message: 'Một tiến trình restore khác đang chạy',
      });
    return {
      data: {
        canRestore: blockers.length === 0,
        backup: this.snapshotView(row),
        summary: {
          collectionCount: row.collectionCount,
          documentCount: row.documentCount,
          sizeBytes: row.sizeBytes,
        },
        collections,
        warnings: [
          'Khôi phục REPLACE sẽ thay thế dữ liệu nghiệp vụ hiện tại. Hệ thống luôn tạo bản sao an toàn trước khi thực hiện.',
        ],
        blockers,
      },
    };
  }
  async deleteSnapshot(id: string) {
    await this.assertSnapshotMutationAvailable();
    const row: any = await this.snapshotRecord(id);
    if (row.status === 'RESTORING')
      throw new ConflictException('Không thể xóa bản sao đang được khôi phục');
    await this.bucket().delete(row.fileId);
    await this.metadata().deleteOne({ _id: row._id });
    return { data: { id, deleted: true } };
  }
  async inspect(file: Buffer) {
    const payload: any = this.decode(file);
    if (
      !payload?.manifest ||
      !payload?.collections ||
      payload.manifest.schemaVersion !== this.schemaVersion
    )
      throw new BadRequestException({
        code: 'BACKUP_SCHEMA_VERSION_UNSUPPORTED',
        message: 'Phiên bản schema backup không được hỗ trợ',
      });
    const names = Object.keys(payload.collections);
    if (names.some((name) => !this.allowedName(name)))
      throw new BadRequestException('File chứa collection không được phép');
    const allowedCollections = new Set(await this.collectionNames(true));
    if (names.some((name) => !allowedCollections.has(name)))
      throw new BadRequestException(
        'File chứa collection ngoài allowlist của ứng dụng',
      );
    for (const item of payload.manifest.collections || [])
      if (
        !Array.isArray(payload.collections[item.name]) ||
        payload.collections[item.name].length !== item.documents
      )
        throw new BadRequestException(
          'Số lượng document trong manifest không khớp',
        );
    const restoreToken = randomUUID(),
      expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    this.restoreTokens.set(restoreToken, {
      payload,
      checksumValid: true,
      expiresAt,
    });
    const expiryTimer = setTimeout(
      () => this.restoreTokens.delete(restoreToken),
      60 * 60 * 1000,
    );
    expiryTimer.unref();
    return {
      data: {
        restoreToken,
        checksumValid: true,
        createdAt: payload.manifest.createdAt,
        schemaVersion: payload.manifest.schemaVersion,
        expiresAt,
        collections: payload.manifest.collections.map((item) => ({
          name: item.name,
          documents: item.documents,
        })),
        warnings: payload.manifest.warnings || [],
      },
    };
  }
  private async verifyAdmin(actorId: string, password: string) {
    const admin: any = await this.users
      .findOne({
        _id: actorId,
        role: RoleEnum.ADMIN,
        status: { $ne: UserStatus.INACTIVE },
        isDeleted: false,
      })
      .select('+password')
      .lean();
    if (
      !admin ||
      !password ||
      !(await bcrypt.compare(password, admin.password))
    )
      throw new ForbiddenException('Mật khẩu quản trị viên không chính xác');
  }
  async startRestore(token: string, dto: any, actorId: string) {
    const stored = this.restoreTokens.get(token);
    if (!stored || stored.expiresAt <= new Date()) {
      this.restoreTokens.delete(token);
      throw new NotFoundException(
        'Restore token không tồn tại hoặc đã hết hạn',
      );
    }
    if (!['REPLACE', 'MERGE'].includes(dto.mode))
      throw new BadRequestException('Chế độ restore không hợp lệ');
    if (dto.confirmation !== 'KHOI PHUC DU LIEU')
      throw new BadRequestException('Chuỗi xác nhận không chính xác');
    await this.verifyAdmin(actorId, dto.currentPassword);
    if (
      [...this.jobs.values()].some(
        (job) => !['COMPLETED', 'FAILED'].includes(job.status),
      ) ||
      (await this.jobCollection().findOne({
        status: { $nin: ['COMPLETED', 'FAILED'] },
        updatedAt: { $gt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      }))
    )
      throw new ConflictException('Một tiến trình restore khác đang chạy');
    const job: RestoreJob = {
      id: randomUUID(),
      status: 'PENDING',
      progress: 0,
      message: 'Đang chờ xử lý',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(job.id, job);
    this.restoreTokens.delete(token);
    await this.jobCollection().insertOne({ ...job, actorId });
    setImmediate(() =>
      this.run(job, stored.payload, dto.mode, { actorId }).catch(
        () => undefined,
      ),
    );
    return {
      data: { jobId: job.id, status: job.status, progress: job.progress },
    };
  }
  async startSnapshotRestore(id: string, dto: any, actorId: string) {
    if (dto.mode !== 'REPLACE')
      throw new BadRequestException('Snapshot chỉ hỗ trợ chế độ REPLACE');
    if (!dto.reason?.trim())
      throw new BadRequestException('Lý do khôi phục là bắt buộc');
    if (dto.confirmation !== 'KHOI PHUC DU LIEU')
      throw new BadRequestException('Chuỗi xác nhận không chính xác');
    if (!dto.idempotencyKey?.trim())
      throw new BadRequestException('idempotencyKey là bắt buộc');
    await this.verifyAdmin(actorId, dto.currentPassword);
    const previous: any = await this.metadata().findOne({
      restoreIdempotencyKey: dto.idempotencyKey,
    });
    if (previous?.restoreJobId)
      return {
        data: {
          jobId: previous.restoreJobId,
          status: previous.restoreJobStatus || 'PENDING',
        },
        idempotent: true,
      };
    if (
      [...this.jobs.values()].some(
        (job) => !['COMPLETED', 'FAILED'].includes(job.status),
      ) ||
      (await this.jobCollection().findOne({
        status: { $nin: ['COMPLETED', 'FAILED'] },
        updatedAt: { $gt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      }))
    )
      throw new ConflictException('Một tiến trình restore khác đang chạy');
    const { row, payload } = await this.verifiedSnapshot(id),
      job: RestoreJob = {
        id: randomUUID(),
        status: 'PENDING',
        progress: 0,
        message: 'Đang chờ xử lý',
        createdAt: new Date(),
        updatedAt: new Date(),
        snapshotId: id,
        actorId,
      };
    const claimed = await this.metadata().findOneAndUpdate(
      { _id: row._id, restoreIdempotencyKey: { $exists: false } },
      {
        $set: {
          status: 'RESTORING',
          restoreIdempotencyKey: dto.idempotencyKey,
          restoreJobId: job.id,
          restoreJobStatus: job.status,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    if (!claimed) {
      const found: any = await this.metadata().findOne({ _id: row._id });
      if (found?.restoreIdempotencyKey === dto.idempotencyKey)
        return {
          data: { jobId: found.restoreJobId, status: found.restoreJobStatus },
          idempotent: true,
        };
      throw new ConflictException('Bản sao đang được khôi phục');
    }
    this.jobs.set(job.id, job);
    await this.jobCollection().insertOne({
      ...job,
      reason: dto.reason,
      snapshotId: id,
    });
    setImmediate(() =>
      this.run(job, payload, 'REPLACE', {
        snapshotId: id,
        actorId,
        reason: dto.reason.trim(),
      }).catch(() => undefined),
    );
    return {
      data: { jobId: job.id, status: job.status, progress: job.progress },
    };
  }
  async getJob(id: string) {
    const job =
      this.jobs.get(id) || (await this.jobCollection().findOne({ id }));
    if (!job) throw new NotFoundException('Không tìm thấy tiến trình restore');
    return { data: job };
  }
  private update(
    job: RestoreJob,
    status: RestoreJobStatus,
    progress: number,
    message: string,
  ) {
    Object.assign(job, { status, progress, message, updatedAt: new Date() });
    this.jobCollection()
      .updateOne(
        { id: job.id },
        {
          $set: {
            status,
            progress,
            message,
            updatedAt: job.updatedAt,
            error: job.error,
          },
        },
        { upsert: true },
      )
      .catch(() => undefined);
    if (job.snapshotId && ObjectId.isValid(job.snapshotId))
      this.metadata()
        .updateOne(
          { _id: new ObjectId(job.snapshotId) },
          { $set: { restoreJobStatus: status, updatedAt: job.updatedAt } },
        )
        .catch(() => undefined);
  }
  private async run(
    job: RestoreJob,
    payload: any,
    mode: RestoreMode,
    context: { snapshotId?: string; actorId?: string; reason?: string },
  ) {
    if (!this.lock.lock()) {
      this.update(
        job,
        'FAILED',
        0,
        'Hệ thống đang bị khóa bởi tiến trình khác',
      );
      return;
    }
    if (!(await this.acquireDistributedRestoreLock(job.id))) {
      this.lock.unlock();
      this.update(job, 'FAILED', 0, 'Một tiến trình restore khác đang chạy');
      return;
    }
    const suffix = `${Date.now()}_${job.id.replace(/-/g, '')}`;
    try {
      this.update(job, 'VALIDATING', 5, 'Đang kiểm tra dữ liệu');
      const entries = Object.entries(payload.collections) as Array<
        [string, any[]]
      >;
      this.update(
        job,
        'CREATING_SAFETY_BACKUP',
        10,
        'Đang tạo bản sao lưu an toàn',
      );
      const actor: any = context.actorId
        ? await this.users
            .findById(context.actorId)
            .select('fullName username role')
            .lean()
        : null;
      const safetySnapshot: any = await this.storeSnapshot({
        name: `Bản sao an toàn trước restore ${job.id}`,
        note: context.reason || 'Tự động tạo trước khi khôi phục',
        includeAuditLogs: true,
        sourceType: 'BEFORE_RESTORE',
        actorId: context.actorId,
        actorName: actor?.fullName || actor?.username || '',
      });
      this.update(job, 'RESTORING', 15, 'Đang khôi phục dữ liệu');
      if (mode === 'MERGE') {
        for (let i = 0; i < entries.length; i++) {
          const [name, docs] = entries[i];
          for (let offset = 0; offset < docs.length; offset += 500) {
            const batch = docs.slice(offset, offset + 500);
            if (batch.length)
              await this.connection.db.collection(name).bulkWrite(
                batch.map((document) => {
                  const { _id, ...fields } = document;
                  return {
                    updateOne: {
                      filter: { _id },
                      update: { $set: fields, $setOnInsert: { _id } },
                      upsert: true,
                    },
                  };
                }),
                { ordered: false },
              );
          }
          this.update(
            job,
            'RESTORING',
            15 + Math.round(((i + 1) / entries.length) * 70),
            `Đang khôi phục ${name}`,
          );
        }
      } else {
        const staged: Array<{ name: string; staging: string; before: string }> =
          [];
        for (let i = 0; i < entries.length; i++) {
          const [name, docs] = entries[i],
            staging = `${name}__restore_${suffix}`,
            before = `${name}__before_${suffix}`;
          const collection = this.connection.db.collection(staging);
          if (docs.length)
            await collection.insertMany(docs, { ordered: false });
          else await this.connection.db.createCollection(staging);
          const manifestEntry = (payload.manifest.collections || []).find(
            (item) => item.name === name,
          );
          for (const index of manifestEntry?.indexes || []) {
            const {
              key,
              name: indexName,
              v,
              ns,
              background,
              ...options
            } = index;
            await collection.createIndex(key, { ...options, name: indexName });
          }
          if ((await collection.countDocuments()) !== docs.length)
            throw new Error(`Sai số lượng document tại ${name}`);
          staged.push({ name, staging, before });
          this.update(
            job,
            'RESTORING',
            15 + Math.round(((i + 1) / entries.length) * 55),
            `Đang dựng staging ${name}`,
          );
        }
        const swapped: typeof staged = [];
        try {
          const existing = new Set(
            (
              await this.connection.db
                .listCollections({}, { nameOnly: true })
                .toArray()
            ).map((item) => item.name),
          );
          for (const item of staged) {
            if (existing.has(item.name))
              await this.connection.db
                .collection(item.name)
                .rename(item.before);
            await this.connection.db.collection(item.staging).rename(item.name);
            swapped.push(item);
          }
        } catch (error) {
          for (const item of swapped.reverse()) {
            await this.connection.db
              .collection(item.name)
              .rename(`${item.staging}_failed`)
              .catch(() => undefined);
            await this.connection.db
              .collection(item.before)
              .rename(item.name)
              .catch(() => undefined);
          }
          throw error;
        }
        for (const item of swapped)
          await this.connection.db
            .dropCollection(item.before)
            .catch(() => undefined);
      }
      this.update(job, 'VERIFYING', 92, 'Đang xác minh kết quả');
      for (const [name, docs] of entries)
        if (
          mode === 'REPLACE' &&
          (await this.connection.db.collection(name).countDocuments()) !==
            docs.length
        )
          throw new Error(`Xác minh thất bại tại ${name}`);
      await this.connection.db
        .collection('auditlogs')
        .insertOne({
          correlationId: randomUUID(),
          occurredAt: new Date(),
          action: 'OTHER',
          status: 'SUCCESS',
          authenticated: true,
          method: 'BACKGROUND',
          path: '/admin/backups/restore',
          resource: 'backups',
          entityId: job.id,
          description: `Khôi phục dữ liệu ${mode} hoàn tất`,
          changedFields: Object.keys(payload.collections),
          httpStatus: 200,
          durationMs: 0,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .catch(() => undefined);
      await this.connection.db
        .collection('notifications')
        .insertOne({
          type: 'SYSTEM_BACKUP_RESTORED',
          title: 'Khôi phục dữ liệu hoàn tất',
          message: `Job ${job.id} đã hoàn tất`,
          audience: 'ADMIN',
          entityType: 'SYSTEM_BACKUP',
          entityId: context.snapshotId,
          entityCode: safetySnapshot.code,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .catch(() => undefined);
      if (context.snapshotId && ObjectId.isValid(context.snapshotId))
        await this.metadata().updateOne(
          { _id: new ObjectId(context.snapshotId) },
          {
            $set: {
              status: 'READY',
              restoredAt: new Date(),
              restoredBy: context.actorId,
              restoreReason: context.reason,
              safetySnapshotId: safetySnapshot.id,
              restoreJobStatus: 'COMPLETED',
              updatedAt: new Date(),
            },
          },
        );
      this.update(job, 'COMPLETED', 100, 'Khôi phục dữ liệu thành công');
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error);
      this.update(job, 'FAILED', job.progress, 'Khôi phục dữ liệu thất bại');
      if (context.snapshotId && ObjectId.isValid(context.snapshotId))
        await this.metadata()
          .updateOne(
            { _id: new ObjectId(context.snapshotId) },
            {
              $set: {
                status: 'READY',
                restoreJobStatus: 'FAILED',
                restoreError: job.error,
                updatedAt: new Date(),
              },
            },
          )
          .catch(() => undefined);
    } finally {
      await this.releaseDistributedRestoreLock(job.id);
      this.lock.unlock();
    }
  }
}
