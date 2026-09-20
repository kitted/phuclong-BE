import { BSON, ObjectId } from 'mongodb';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from 'nestjs-typegoose';
import { BackupLockService } from './backup-lock.service';
import { BackupsService } from './backups.service';
import { Users } from '../users/schemas/users.schema';

describe('encrypted backup envelope', () => {
  const previousEncryption = process.env.BACKUP_ENCRYPTION_KEY;
  const previousSigning = process.env.BACKUP_SIGNING_KEY;
  beforeAll(() => {
    process.env.BACKUP_ENCRYPTION_KEY = 'test-encryption-key';
    process.env.BACKUP_SIGNING_KEY = 'test-signing-key';
  });
  afterAll(() => {
    if (previousEncryption === undefined)
      delete process.env.BACKUP_ENCRYPTION_KEY;
    else process.env.BACKUP_ENCRYPTION_KEY = previousEncryption;
    if (previousSigning === undefined) delete process.env.BACKUP_SIGNING_KEY;
    else process.env.BACKUP_SIGNING_KEY = previousSigning;
  });

  it('round-trips MongoDB types through EJSON, gzip, encryption and signature', () => {
    const service: any = new BackupsService(
      {} as any,
      {} as any,
      new BackupLockService(),
    );
    const id = new ObjectId();
    const decoded = service.decode(
      service.encode({ id, at: new Date('2026-07-31T10:00:00.000Z') }),
    );
    expect(String(decoded.id)).toBe(String(id));
    expect(decoded.at).toEqual(new Date('2026-07-31T10:00:00.000Z'));
  });

  it('rejects a modified backup file', () => {
    const service: any = new BackupsService(
      {} as any,
      {} as any,
      new BackupLockService(),
    );
    const file: Buffer = service.encode({ value: 1 });
    file[file.length - 1] ^= 1;
    expect(() => service.decode(file)).toThrow('checksum');
  });

  it('streams a compatible backup without loading a collection into an array', async () => {
    const id = new ObjectId();
    const cursor = {
      async *[Symbol.asyncIterator]() {
        yield { _id: id, name: 'Xe tải', createdAt: new Date('2026-09-19') };
        yield { _id: new ObjectId(), name: 'Tồn kho' };
      },
      close: jest.fn().mockResolvedValue(undefined),
    };
    const collection = {
      indexes: jest
        .fn()
        .mockResolvedValue([
          { name: '_id_' },
          { name: 'name_1', key: { name: 1 } },
        ]),
      find: jest.fn().mockReturnValue(cursor),
    };
    const connection = {
      db: {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([{ name: 'items' }]),
        }),
        collection: jest.fn().mockReturnValue(collection),
      },
    };
    const service: any = new BackupsService(
      connection as any,
      {} as any,
      new BackupLockService(),
    );

    const result = await service.export(true);
    const chunks: Buffer[] = [];
    for await (const chunk of result.file) chunks.push(Buffer.from(chunk));
    const decoded = service.decode(Buffer.concat(chunks));
    await result.cleanup();

    expect(collection.find).toHaveBeenCalledWith({}, { batchSize: 250 });
    expect(cursor.close).toHaveBeenCalled();
    expect(decoded.collections.items).toHaveLength(2);
    expect(String(decoded.collections.items[0]._id)).toBe(String(id));
    expect(decoded.manifest.collections).toEqual([
      expect.objectContaining({ name: 'items', documents: 2 }),
    ]);

    const generated = await service.generateBackupFile(true);
    let streamedDocuments = 0;
    await service.parseBackupStream(generated.path, {
      document: (_name, document) => {
        expect(() => BSON.serialize(document)).not.toThrow();
        streamedDocuments++;
      },
    });
    expect(streamedDocuments).toBe(2);
    const inspection = await service.inspectFile(generated.path);
    expect(inspection.data.collections).toEqual([
      expect.objectContaining({ name: 'items', documents: 2 }),
    ]);
    expect(inspection.data.persisted).toBe(false);
    expect(inspection.data.restoreToken).toBeUndefined();
    await service.cleanupGeneratedFile(generated);
  });

  it('restores from GridFS without rejecting an expired restore token', async () => {
    const service: any = new BackupsService(
        {} as any,
        {} as any,
        new BackupLockService(),
      ),
      fileId = new ObjectId(),
      session = {
        _id: 'persisted-token',
        status: 'READY',
        fileId,
        manifest: { schemaVersion: '2.0.0', collections: [] },
        checksumValid: true,
        expiresAt: new Date(Date.now() - 60_000),
      },
      sessions = {
        findOne: jest.fn().mockResolvedValue(null),
        findOneAndUpdate: jest.fn().mockResolvedValue({
          ...session,
          status: 'CLAIMED',
        }),
        updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
      };
    service.restoreSessions = jest.fn().mockReturnValue(sessions);
    service.restoreFiles = jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue({
        _id: fileId,
        uploadDate: new Date(),
        metadata: {
          restoreToken: 'persisted-token',
          expiresAt: session.expiresAt,
          manifest: session.manifest,
        },
      }),
    });
    service.verifyAdmin = jest.fn().mockResolvedValue(undefined);
    service.jobCollection = jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(null),
      insertOne: jest.fn().mockResolvedValue({}),
    });
    service.materializeRestoreFile = jest.fn().mockResolvedValue({
      path: '/tmp/persisted-token.plbackup',
      directory: '/tmp/persisted-token',
    });
    service.run = jest.fn().mockResolvedValue(undefined);

    const result = await service.startRestore(
      'persisted-token',
      {
        mode: 'REPLACE',
        confirmation: 'KHOI PHUC DU LIEU',
        currentPassword: 'secret',
      },
      String(new ObjectId()),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(result.data.status).toBe('PENDING');
    expect(sessions.findOne).toHaveBeenCalled();
    expect(service.restoreFiles().findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        'metadata.restoreToken': 'persisted-token',
      }),
    );
    expect(sessions.updateOne).toHaveBeenCalled();
    expect(sessions.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'persisted-token',
        status: 'READY',
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(service.run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fileId,
        restoreToken: 'persisted-token',
        filePath: '/tmp/persisted-token.plbackup',
      }),
      'REPLACE',
      expect.anything(),
    );
  });

  it('starts restore directly from the uploaded file without a restore token', async () => {
    const service: any = new BackupsService(
      {} as any,
      {} as any,
      new BackupLockService(),
    );
    service.verifyAdmin = jest.fn().mockResolvedValue(undefined);
    service.validateBackupFile = jest.fn().mockResolvedValue({
      schemaVersion: '2.0.0',
      collections: [],
    });
    service.jobCollection = jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(null),
      insertOne: jest.fn().mockResolvedValue({}),
    });
    service.run = jest.fn().mockResolvedValue(undefined);

    const result = await service.startRestoreFile(
      '/tmp/direct-restore.plbackup',
      {
        mode: 'REPLACE',
        confirmation: 'KHOI PHUC DU LIEU',
        currentPassword: 'secret',
      },
      String(new ObjectId()),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(result.data.status).toBe('PENDING');
    expect(service.run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filePath: '/tmp/direct-restore.plbackup',
        manifest: expect.objectContaining({ schemaVersion: '2.0.0' }),
      }),
      'REPLACE',
      expect.anything(),
    );
  });

  it('accepts records appended after the exact staging verification', async () => {
    const counts: Record<string, number> = { auditlogs: 12, items: 5 },
      service: any = new BackupsService(
        {
          db: {
            collection: (name: string) => ({
              countDocuments: jest.fn().mockResolvedValue(counts[name]),
            }),
          },
        } as any,
        {} as any,
        new BackupLockService(),
      ),
      manifest = {
        collections: [
          { name: 'auditlogs', documents: 10 },
          { name: 'items', documents: 5 },
        ],
      };

    await expect(
      service.verifyRestoredCollections(manifest, 'REPLACE'),
    ).resolves.toBeUndefined();
    counts.items = 4;
    await expect(
      service.verifyRestoredCollections(manifest, 'REPLACE'),
    ).rejects.toThrow('items: 4/5');
  });
});

describe('BackupsService dependency injection', () => {
  it('uses the Typegoose connection token registered by this application', async () => {
    const module = await Test.createTestingModule({
      providers: [
        BackupsService,
        BackupLockService,
        { provide: getConnectionToken(), useValue: { db: {} } },
        { provide: getModelToken(Users.name), useValue: {} },
      ],
    }).compile();
    expect(module.get(BackupsService)).toBeDefined();
  });
});
