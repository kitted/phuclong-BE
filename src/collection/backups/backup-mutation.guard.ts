import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { BackupLockService } from './backup-lock.service';

@Injectable()
export class BackupMutationGuard implements CanActivate {
  constructor(private readonly lock: BackupLockService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (!this.lock.isLocked() || ['GET', 'HEAD', 'OPTIONS'].includes(request.method) || String(request.path || request.url).includes('/backups/')) return true;
    throw new ServiceUnavailableException({ code: 'DATABASE_RESTORE_IN_PROGRESS', message: 'Hệ thống đang khôi phục dữ liệu, vui lòng thử lại sau' });
  }
}
