import { BadRequestException, Body, Get, Param, Post, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';
import { BackupsService } from '../../../collection/backups/backups.service';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';

@WarehouseController(['backups'])
@AdminOnly()
export class BackupsController {
  constructor(private readonly service: BackupsService) {}
  private actorId(request: AuthRequest) { const user: any = request.user; const doc = user?._doc || user; return String(doc?.id || doc?._id || ''); }

  @Post('export')
  async export(@Body() dto: any, @Res({ passthrough: true }) response: Response) {
    if (dto.format && dto.format !== 'EJSON_GZIP') throw new BadRequestException('Định dạng backup không được hỗ trợ');
    const file = await this.service.export(dto.includeAuditLogs !== false);
    const date = new Date().toISOString().slice(0, 10);
    response.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="phuclong-backup-${date}.plbackup"` });
    return new StreamableFile(file);
  }

  @Post('inspect')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 512 * 1024 * 1024 } }))
  inspect(@UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('Vui lòng chọn file backup');
    return this.service.inspect(file.buffer);
  }

  @Post(':restoreToken/restore')
  restore(@Param('restoreToken') token: string, @Body() dto: any, @Req() request: AuthRequest) {
    return this.service.startRestore(token, dto, this.actorId(request));
  }

  @Get('jobs/:jobId')
  job(@Param('jobId') id: string) { return this.service.getJob(id); }
}
