import { ObjectId } from 'bson';
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
    if (previousEncryption === undefined) delete process.env.BACKUP_ENCRYPTION_KEY; else process.env.BACKUP_ENCRYPTION_KEY = previousEncryption;
    if (previousSigning === undefined) delete process.env.BACKUP_SIGNING_KEY; else process.env.BACKUP_SIGNING_KEY = previousSigning;
  });

  it('round-trips MongoDB types through EJSON, gzip, encryption and signature', () => {
    const service: any = new BackupsService({} as any, {} as any, new BackupLockService());
    const id = new ObjectId();
    const decoded = service.decode(service.encode({ id, at: new Date('2026-07-31T10:00:00.000Z') }));
    expect(String(decoded.id)).toBe(String(id));
    expect(decoded.at).toEqual(new Date('2026-07-31T10:00:00.000Z'));
  });

  it('rejects a modified backup file', () => {
    const service: any = new BackupsService({} as any, {} as any, new BackupLockService());
    const file: Buffer = service.encode({ value: 1 });
    file[file.length - 1] ^= 1;
    expect(() => service.decode(file)).toThrow('checksum');
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
