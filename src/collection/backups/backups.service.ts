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
import { BSON, GridFSBucket, ObjectId } from 'mongodb';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';
import { createGunzip, createGzip, gzipSync, gunzipSync } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { mkdtemp, open, rm, stat, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { parser } from 'stream-json';
// stream-json 1.x exposes Assembler as CommonJS only.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Assembler = require('stream-json/Assembler');
import * as bcrypt from 'bcrypt';
import { Users, UserStatus } from '../users/schemas/users.schema';
import { RoleEnum } from '../users/interfaces/role.enum';
import { BackupLockService } from './backup-lock.service';

const { EJSON } = BSON;

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
type StoredBackup = {
  payload?: any;
  filePath?: string;
  directory?: string;
  fileId?: ObjectId;
  restoreToken?: string;
  manifest?: any;
  checksumValid: boolean;
  expiresAt: Date;
};
type GeneratedBackupFile = {
  path: string;
  directory: string;
  sizeBytes: number;
  checksum: string;
  manifest: any;
};

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
  private restoreBucket() {
    return new GridFSBucket(this.backupDb(), {
      bucketName: 'restore_uploads',
    });
  }
  private restoreSessions() {
    return this.backupDb().collection<any>('restore_sessions');
  }
  private restoreFiles() {
    return this.backupDb().collection<any>('restore_uploads.files');
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
  private async fileHash(path: string, algorithm: 'sha256' | 'sha512') {
    const hash = createHash(algorithm);
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
  }

  private async cleanupGeneratedFile(file?: GeneratedBackupFile) {
    if (file?.directory)
      await rm(file.directory, { recursive: true, force: true }).catch(
        () => undefined,
      );
  }

  private snapshotJsonStream(
    names: string[],
    includeAuditLogs: boolean,
    state: { manifest?: any },
  ) {
    const database = this.connection.db,
      schemaVersion = this.schemaVersion;
    return Readable.from(
      (async function* () {
        const collections: any[] = [],
          createdAt = new Date();
        yield '{"collections":{';
        for (
          let collectionIndex = 0;
          collectionIndex < names.length;
          collectionIndex++
        ) {
          const name = names[collectionIndex],
            collection = database.collection(name),
            indexes = (await collection.indexes()).filter(
              (index) => index.name !== '_id_',
            );
          if (collectionIndex) yield ',';
          yield `${JSON.stringify(name)}:[`;
          let documents = 0;
          const cursor = collection.find({}, { batchSize: 250 });
          try {
            for await (const document of cursor) {
              if (documents) yield ',';
              yield EJSON.stringify(document, { relaxed: false });
              documents++;
            }
          } finally {
            await cursor.close().catch(() => undefined);
          }
          yield ']';
          collections.push({ name, documents, indexes });
        }
        state.manifest = {
          schemaVersion,
          createdAt,
          format: 'EJSON_GZIP_AES_256_GCM',
          includeAuditLogs,
          collections,
          warnings: ['Ảnh Cloudinary không nằm trong file backup database.'],
        };
        yield `},"manifest":${EJSON.stringify(state.manifest, { relaxed: false })}}`;
      })(),
    );
  }

  private async generateBackupFile(
    includeAuditLogs = true,
  ): Promise<GeneratedBackupFile> {
    const names = await this.collectionNames(includeAuditLogs),
      directory = await mkdtemp(join(tmpdir(), 'phuclong-backup-')),
      path = join(directory, 'backup.plbackup'),
      iv = randomBytes(12),
      header = Buffer.alloc(69),
      state: { manifest?: any } = {};
    Buffer.from('PLBACKUP2').copy(header, 0);
    iv.copy(header, 41);
    try {
      await writeFile(path, header, { flag: 'wx' });
      const cipher = createCipheriv(
        'aes-256-gcm',
        this.key('BACKUP_ENCRYPTION_KEY'),
        iv,
      );
      await pipeline(
        this.snapshotJsonStream(names, includeAuditLogs, state),
        createGzip({ level: 6 }),
        cipher,
        createWriteStream(path, { flags: 'r+', start: 69 }),
      );
      const tag = cipher.getAuthTag(),
        handle = await open(path, 'r+');
      try {
        await handle.write(tag, 0, tag.length, 53);
      } finally {
        await handle.close();
      }
      const signatureHash = createHmac(
        'sha256',
        this.key('BACKUP_SIGNING_KEY'),
      );
      for await (const chunk of createReadStream(path, { start: 41 }))
        signatureHash.update(chunk);
      const signature = signatureHash.digest(),
        signatureHandle = await open(path, 'r+');
      try {
        await signatureHandle.write(signature, 0, signature.length, 9);
      } finally {
        await signatureHandle.close();
      }
      const fileStat = await stat(path);
      return {
        path,
        directory,
        sizeBytes: fileStat.size,
        checksum: await this.fileHash(path, 'sha256'),
        manifest: state.manifest,
      };
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(
        () => undefined,
      );
      throw error;
    }
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
  private async backupContentStream(path: string) {
    const handle = await open(path, 'r'),
      header = Buffer.alloc(69);
    try {
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (
        bytesRead < header.length ||
        header.subarray(0, 9).toString() !== 'PLBACKUP2'
      )
        throw new BadRequestException('File backup không đúng định dạng');
    } finally {
      await handle.close();
    }
    const signature = header.subarray(9, 41),
      expectedHash = createHmac('sha256', this.key('BACKUP_SIGNING_KEY'));
    for await (const chunk of createReadStream(path, { start: 41 }))
      expectedHash.update(chunk);
    const expected = expectedHash.digest();
    if (!timingSafeEqual(signature, expected))
      throw new BadRequestException({
        code: 'BACKUP_CHECKSUM_INVALID',
        message: 'Chữ ký hoặc checksum file backup không hợp lệ',
      });
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key('BACKUP_ENCRYPTION_KEY'),
      header.subarray(41, 53),
    );
    decipher.setAuthTag(header.subarray(53, 69));
    return createReadStream(path, { start: 69 })
      .pipe(decipher)
      .pipe(createGunzip());
  }

  private async parseBackupStream(
    path: string,
    handlers: {
      collectionStart?: (name: string) => Promise<void> | void;
      document?: (name: string, document: any) => Promise<void> | void;
      collectionEnd?: (name: string) => Promise<void> | void;
    } = {},
  ) {
    const content = await this.backupContentStream(path),
      tokens = content.pipe(
        parser({
          packKeys: true,
          packStrings: true,
          packNumbers: true,
          streamKeys: false,
          streamStrings: false,
          streamNumbers: false,
        }),
      );
    let depth = 0,
      rootKey = '',
      collectionName = '',
      capture: 'document' | 'manifest' | undefined,
      assembler: Assembler | undefined,
      manifest: any;
    try {
      for await (const token of tokens as any) {
        if (capture && assembler) {
          assembler.consume(token);
          if (token.name === 'startObject' || token.name === 'startArray')
            depth++;
          else if (token.name === 'endObject' || token.name === 'endArray')
            depth--;
          if (assembler.done) {
            if (capture === 'document' && handlers.document)
              await handlers.document(
                collectionName,
                EJSON.parse(JSON.stringify(assembler.current)),
              );
            else if (capture === 'manifest')
              manifest = EJSON.parse(JSON.stringify(assembler.current));
            capture = undefined;
            assembler = undefined;
          }
          continue;
        }
        if (token.name === 'keyValue') {
          if (depth === 1) rootKey = token.value;
          else if (depth === 2 && rootKey === 'collections')
            collectionName = token.value;
          continue;
        }
        if (
          rootKey === 'manifest' &&
          depth === 1 &&
          (token.name === 'startObject' || token.name === 'startArray')
        ) {
          capture = 'manifest';
          assembler = new Assembler();
          assembler.consume(token);
          depth++;
          continue;
        }
        if (
          token.name === 'startArray' &&
          depth === 2 &&
          rootKey === 'collections'
        ) {
          await handlers.collectionStart?.(collectionName);
          depth++;
          continue;
        }
        if (
          depth === 3 &&
          rootKey === 'collections' &&
          (token.name === 'startObject' || token.name === 'startArray')
        ) {
          capture = 'document';
          assembler = new Assembler();
          assembler.consume(token);
          depth++;
          continue;
        }
        if (
          token.name === 'endArray' &&
          depth === 3 &&
          rootKey === 'collections'
        ) {
          await handlers.collectionEnd?.(collectionName);
          depth--;
          continue;
        }
        if (token.name === 'startObject' || token.name === 'startArray')
          depth++;
        else if (token.name === 'endObject' || token.name === 'endArray')
          depth--;
      }
    } catch (error) {
      content.destroy();
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException(
            `Không thể giải mã hoặc đọc file backup: ${error instanceof Error ? error.message : 'dữ liệu lỗi'}`,
          );
    }
    if (!manifest)
      throw new BadRequestException('File backup không có manifest hợp lệ');
    return manifest;
  }
  async export(includeAuditLogs = true) {
    const generated = await this.generateBackupFile(includeAuditLogs),
      file = createReadStream(generated.path);
    let cleanupStarted = false;
    const cleanup = () => {
      if (cleanupStarted) return Promise.resolve();
      cleanupStarted = true;
      return this.cleanupGeneratedFile(generated);
    };
    file.once('close', () => {
      void cleanup();
    });
    return { file, sizeBytes: generated.sizeBytes, cleanup };
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
  private async uploadGeneratedFile(
    file: GeneratedBackupFile,
    filename: string,
    metadata: any,
  ) {
    const upload = this.bucket().openUploadStream(filename, { metadata });
    await pipeline(createReadStream(file.path), upload);
    return upload.id;
  }
  private async uploadRestoreFile(
    path: string,
    filename: string,
    metadata: any,
  ) {
    const upload = this.restoreBucket().openUploadStream(filename, {
      metadata,
    });
    await pipeline(createReadStream(path), upload);
    return upload.id;
  }
  private async materializeRestoreFile(fileId: ObjectId, token: string) {
    const directory = await mkdtemp(join(tmpdir(), 'phuclong-restore-')),
      path = join(directory, `${token}.plbackup`);
    try {
      await pipeline(
        this.restoreBucket().openDownloadStream(fileId),
        createWriteStream(path, { flags: 'wx' }),
      );
      return { path, directory };
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(
        () => undefined,
      );
      throw error;
    }
  }
  private async deleteRestoreSession(token: string, fileId?: ObjectId) {
    if (fileId)
      await this.restoreBucket()
        .delete(fileId)
        .catch(() => undefined);
    await this.restoreSessions()
      .deleteOne({ _id: token })
      .catch(() => undefined);
    this.restoreTokens.delete(token);
  }
  private async cleanupRestoreSource(source: any) {
    if (source?.directory)
      await rm(source.directory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    else if (source?.filePath)
      await unlink(source.filePath).catch(() => undefined);
    if (source?.restoreToken)
      await this.deleteRestoreSession(source.restoreToken, source.fileId);
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
  private async gridFsHash(fileId: ObjectId) {
    const hash = createHash('sha256');
    for await (const chunk of this.bucket().openDownloadStream(fileId))
      hash.update(chunk);
    return hash.digest('hex');
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
    const code = await this.nextSnapshotCode(),
      now = new Date(),
      generated = await this.generateBackupFile(input.includeAuditLogs);
    let fileId: ObjectId | undefined;
    try {
      fileId = await this.uploadGeneratedFile(generated, `${code}.plbackup`, {
        code,
        sourceType: input.sourceType,
        schemaVersion: this.schemaVersion,
      });
      const collectionCount = generated.manifest.collections.length,
        collections = generated.manifest.collections.map((item) => ({
          name: item.name,
          documents: item.documents,
        })),
        documentCount = generated.manifest.collections.reduce(
          (sum, item) => sum + item.documents,
          0,
        );
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
        sizeBytes: generated.sizeBytes,
        schemaVersion: this.schemaVersion,
        collectionCount,
        collections,
        documentCount,
        checksum: generated.checksum,
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
          sizeBytes: generated.sizeBytes,
          schemaVersion: this.schemaVersion,
          collectionCount,
          documentCount,
          checksum: generated.checksum,
          includeAuditLogs: input.includeAuditLogs,
        }),
        fileId,
      };
    } catch (error) {
      if (fileId)
        await this.bucket()
          .delete(fileId)
          .catch(() => undefined);
      throw error;
    } finally {
      await this.cleanupGeneratedFile(generated);
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
    const row: any = await this.snapshotRecord(id);
    if (row.status !== 'READY')
      throw new ConflictException('Bản sao chưa sẵn sàng');
    if (row.schemaVersion !== this.schemaVersion)
      throw new BadRequestException({
        code: 'BACKUP_SCHEMA_VERSION_UNSUPPORTED',
        message: 'Phiên bản schema backup không được hỗ trợ',
      });
    if ((await this.gridFsHash(row.fileId)) !== row.checksum)
      throw new BadRequestException({
        code: 'BACKUP_CHECKSUM_INVALID',
        message: 'Checksum bản sao không hợp lệ',
      });
    return {
      file: this.bucket().openDownloadStream(row.fileId),
      filename: `${row.code}.plbackup`,
      sizeBytes: row.sizeBytes,
    };
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
  private async validateBackupFile(path: string) {
    const counts = new Map<string, number>(),
      manifest = await this.parseBackupStream(path, {
        collectionStart: (name) => {
          counts.set(name, 0);
        },
        document: (name) => {
          counts.set(name, (counts.get(name) || 0) + 1);
        },
      });
    if (manifest.schemaVersion !== this.schemaVersion)
      throw new BadRequestException({
        code: 'BACKUP_SCHEMA_VERSION_UNSUPPORTED',
        message: 'Phiên bản schema backup không được hỗ trợ',
      });
    const names = [...counts.keys()];
    if (names.some((name) => !this.allowedName(name)))
      throw new BadRequestException('File chứa collection không được phép');
    const allowedCollections = new Set(await this.collectionNames(true));
    if (names.some((name) => !allowedCollections.has(name)))
      throw new BadRequestException(
        'File chứa collection ngoài allowlist của ứng dụng',
      );
    for (const item of manifest.collections || [])
      if (counts.get(item.name) !== item.documents)
        throw new BadRequestException(
          `Số lượng document trong manifest không khớp tại ${item.name}: ${counts.get(item.name) || 0}/${item.documents}`,
        );
    return manifest;
  }
  async inspectFile(path: string) {
    try {
      const manifest = await this.validateBackupFile(path);
      return {
        data: {
          checksumValid: true,
          createdAt: manifest.createdAt,
          schemaVersion: manifest.schemaVersion,
          persisted: false,
          collections: manifest.collections.map((item) => ({
            name: item.name,
            documents: item.documents,
          })),
          warnings: manifest.warnings || [],
        },
      };
    } finally {
      await unlink(path).catch(() => undefined);
    }
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
  async startRestoreFile(path: string, dto: any, actorId: string) {
    let handedOff = false;
    try {
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
      const manifest = await this.validateBackupFile(path),
        job: RestoreJob = {
          id: randomUUID(),
          status: 'PENDING',
          progress: 0,
          message: 'Đang chờ xử lý',
          createdAt: new Date(),
          updatedAt: new Date(),
          actorId,
        },
        source: StoredBackup = {
          filePath: path,
          manifest,
          checksumValid: true,
          expiresAt: new Date(8640000000000000),
        };
      this.jobs.set(job.id, job);
      await this.jobCollection().insertOne({ ...job, actorId });
      handedOff = true;
      setImmediate(() => {
        void this.run(job, source, dto.mode, { actorId }).catch(
          () => undefined,
        );
      });
      return {
        data: { jobId: job.id, status: job.status, progress: job.progress },
      };
    } finally {
      if (!handedOff) await unlink(path).catch(() => undefined);
    }
  }
  async startRestore(token: string, dto: any, actorId: string) {
    let stored = this.restoreTokens.get(token),
      persisted: any;
    if (!stored) {
      persisted = await this.restoreSessions().findOne({ _id: token } as any);
      if (!persisted) {
        const gridFile = await this.restoreFiles().findOne({
          'metadata.restoreToken': token,
        });
        if (gridFile?.metadata?.manifest) {
          persisted = {
            _id: token,
            status: 'READY',
            fileId: gridFile._id,
            manifest: gridFile.metadata.manifest,
            checksumValid: true,
            expiresAt: gridFile.metadata.expiresAt,
            createdAt: gridFile.uploadDate || new Date(),
            recoveredFromGridFs: true,
          };
          await this.restoreSessions().updateOne(
            { _id: token },
            { $setOnInsert: persisted },
            { upsert: true },
          );
        }
      }
      if (persisted)
        stored = {
          fileId: persisted.fileId,
          restoreToken: token,
          manifest: persisted.manifest,
          checksumValid: persisted.checksumValid,
          expiresAt: persisted.expiresAt,
        };
    }
    if (!stored) {
      throw new NotFoundException({
        code: 'RESTORE_FILE_NOT_FOUND',
        message:
          'Không tìm thấy file backup tương ứng trong kho lưu trữ. Vui lòng tải file lên lại.',
        storageDatabase: this.backupDb().databaseName,
      });
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
    if (persisted) {
      const claimed: any = await this.restoreSessions().findOneAndUpdate(
        {
          _id: token,
          status: 'READY',
        } as any,
        {
          $set: {
            status: 'CLAIMED',
            jobId: job.id,
            claimedAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      );
      if (!claimed)
        throw new ConflictException(
          'Phiên restore đã được sử dụng hoặc đang được xử lý',
        );
      try {
        const materialized = await this.materializeRestoreFile(
          stored.fileId,
          token,
        );
        stored.filePath = materialized.path;
        stored.directory = materialized.directory;
      } catch (error) {
        await this.restoreSessions().updateOne(
          { _id: token, jobId: job.id } as any,
          { $set: { status: 'READY' }, $unset: { jobId: '', claimedAt: '' } },
        );
        throw error;
      }
    }
    this.jobs.set(job.id, job);
    this.restoreTokens.delete(token);
    await this.jobCollection().insertOne({ ...job, actorId });
    setImmediate(() => {
      void this.run(job, stored, dto.mode, { actorId }).catch(() => undefined);
    });
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
    setImmediate(() => {
      void this.run(job, payload, 'REPLACE', {
        snapshotId: id,
        actorId,
        reason: dto.reason.trim(),
      }).catch(() => undefined);
    });
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
  private async restoreStreamedBackup(
    path: string,
    manifest: any,
    mode: RestoreMode,
    suffix: string,
    job: RestoreJob,
  ) {
    const manifestEntries = new Map<string, any>(
        (manifest.collections || []).map((item) => [item.name, item]),
      ),
      staged: Array<{ name: string; staging: string; before: string }> = [];
    let active:
        | {
            name: string;
            collection: any;
            batch: any[];
            documents: number;
            staging?: string;
            before?: string;
          }
        | undefined,
      completed = 0;
    const flush = async () => {
      if (!active?.batch.length) return;
      const batch = active.batch;
      active.batch = [];
      if (mode === 'MERGE')
        await active.collection.bulkWrite(
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
      else await active.collection.insertMany(batch, { ordered: false });
    };
    await this.parseBackupStream(path, {
      collectionStart: async (name) => {
        if (!manifestEntries.has(name) || !this.allowedName(name))
          throw new BadRequestException(`Collection ${name} không hợp lệ`);
        if (mode === 'REPLACE') {
          const staging = `${name}__restore_${suffix}`;
          await this.connection.db.createCollection(staging);
          active = {
            name,
            collection: this.connection.db.collection(staging),
            batch: [],
            documents: 0,
            staging,
            before: `${name}__before_${suffix}`,
          };
        } else
          active = {
            name,
            collection: this.connection.db.collection(name),
            batch: [],
            documents: 0,
          };
      },
      document: async (name, document) => {
        if (!active || active.name !== name)
          throw new BadRequestException('Cấu trúc collection không hợp lệ');
        active.batch.push(document);
        active.documents++;
        if (active.batch.length >= 500) await flush();
      },
      collectionEnd: async (name) => {
        if (!active || active.name !== name)
          throw new BadRequestException('Cấu trúc collection không hợp lệ');
        await flush();
        const expected = manifestEntries.get(name);
        if (active.documents !== expected.documents)
          throw new BadRequestException(
            `Số lượng document không khớp tại ${name}`,
          );
        if (mode === 'REPLACE') {
          for (const index of expected.indexes || []) {
            const {
              key,
              name: indexName,
              v,
              ns,
              background,
              ...options
            } = index;
            await active.collection.createIndex(key, {
              ...options,
              name: indexName,
            });
          }
          if ((await active.collection.countDocuments()) !== active.documents)
            throw new Error(`Sai số lượng document tại ${name}`);
          staged.push({
            name,
            staging: active.staging,
            before: active.before,
          });
        }
        completed++;
        this.update(
          job,
          'RESTORING',
          15 +
            Math.round(
              (completed / Math.max(1, manifestEntries.size)) *
                (mode === 'REPLACE' ? 55 : 70),
            ),
          `Đang khôi phục ${name}`,
        );
        active = undefined;
      },
    });
    if (completed !== manifestEntries.size)
      throw new BadRequestException('Danh sách collection không khớp manifest');
    if (mode === 'REPLACE') {
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
            await this.connection.db.collection(item.name).rename(item.before);
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
  }
  private async run(
    job: RestoreJob,
    source: any,
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
      await this.cleanupRestoreSource(source);
      return;
    }
    if (!(await this.acquireDistributedRestoreLock(job.id))) {
      this.lock.unlock();
      this.update(job, 'FAILED', 0, 'Một tiến trình restore khác đang chạy');
      await this.cleanupRestoreSource(source);
      return;
    }
    const suffix = `${Date.now()}_${job.id.replace(/-/g, '')}`;
    try {
      this.update(job, 'VALIDATING', 5, 'Đang kiểm tra dữ liệu');
      const streamedFile: string | undefined = source?.filePath,
        payload = source?.payload || source,
        manifest = source?.manifest || payload.manifest,
        collections: Record<string, any[]> = payload?.collections || {},
        entries = Object.entries(collections);
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
      if (streamedFile) {
        await this.restoreStreamedBackup(
          streamedFile,
          manifest,
          mode,
          suffix,
          job,
        );
      } else if (mode === 'MERGE') {
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
      const expectedCollections: Array<{ name: string; documents: number }> =
        manifest.collections || [];
      for (const expected of expectedCollections)
        if (
          mode === 'REPLACE' &&
          (await this.connection.db
            .collection(expected.name)
            .countDocuments()) !== expected.documents
        )
          throw new Error(`Xác minh thất bại tại ${expected.name}`);
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
          changedFields: expectedCollections.map((item) => item.name),
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
      job.error =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Lỗi không xác định';
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
      await this.cleanupRestoreSource(source);
      await this.releaseDistributedRestoreLock(job.id);
      this.lock.unlock();
    }
  }
}
