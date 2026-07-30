import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypegooseModule } from 'nestjs-typegoose';
import { Users } from '../users/schemas/users.schema';
import { BackupsService } from './backups.service';
import { BackupLockService } from './backup-lock.service';
import { BackupMutationGuard } from './backup-mutation.guard';

@Global()
@Module({
  imports: [TypegooseModule.forFeature([Users])],
  providers: [BackupsService, BackupLockService, { provide: APP_GUARD, useClass: BackupMutationGuard }],
  exports: [BackupsService, BackupLockService],
})
export class BackupsModule {}
