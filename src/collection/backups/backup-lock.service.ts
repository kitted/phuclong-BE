import { Injectable } from '@nestjs/common';

@Injectable()
export class BackupLockService {
  private locked = false;
  isLocked() { return this.locked; }
  lock() { if (this.locked) return false; this.locked = true; return true; }
  unlock() { this.locked = false; }
}
