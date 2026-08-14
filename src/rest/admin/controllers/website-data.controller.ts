import { BadRequestException, Get, Post, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { WebsiteDataImportService } from '../../../collection/website-contents/website-data-import.service';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

const websiteExcelInterceptor = FileInterceptor('file', {
  limits: { files: 1, fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const name = String(file.originalname || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv'))
      return callback(new BadRequestException('Chỉ hỗ trợ file .xlsx hoặc .csv'), false);
    callback(null, true);
  },
});

@WarehouseController(['website-data'])
export class WebsiteDataController {
  constructor(private readonly service: WebsiteDataImportService) {}

  private actor(req: AuthRequest): string {
    const user: any = req.user, doc = user?._doc || user;
    return String(doc?.id || doc?._id || '');
  }

  @Get('import-template')
  @AdminOnly()
  async template(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const file = await this.service.template();
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="website-data-import.xlsx"',
    });
    return new StreamableFile(file);
  }

  @Post('import/preview')
  @AdminOnly()
  @UseInterceptors(websiteExcelInterceptor)
  preview(@UploadedFile() file: any): Promise<any> {
    return this.service.preview(file);
  }

  @Post('import')
  @AdminOnly()
  @UseInterceptors(websiteExcelInterceptor)
  apply(@UploadedFile() file: any, @Req() req: AuthRequest): Promise<any> {
    return this.service.apply(file, this.actor(req));
  }
}
