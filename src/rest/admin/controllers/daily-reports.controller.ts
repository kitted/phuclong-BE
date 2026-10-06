import {
  Body,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { WarehouseController } from '../decorators/warehouse';
import { DailyReportsService } from '../../../collection/daily-reports/daily-reports.service';
import {
  CreateDailyReportDto,
  DailyReportPreviewQueryDto,
  DailyReportQueryDto,
  UpdateDailyReportDto,
} from '../../../collection/daily-reports/dtos/daily-reports.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
@WarehouseController(['daily-reports'])
export class DailyReportsController {
  constructor(private service: DailyReportsService) {}
  private actor(req: AuthRequest) {
    const u: any = req.user,
      d = u?._doc || u;
    return String(d?.id || d?._id || '');
  }
  private assertSalespersonAccess(req: AuthRequest, salespersonId: string) {
    const user: any = (req.user as any)?._doc || req.user;
    if (
      String(user?.role || '').toLowerCase() === 'staff' &&
      this.actor(req) !== String(salespersonId)
    )
      throw new ForbiddenException('Sale chỉ được lập báo cáo của chính mình');
  }
  @Get('salespeople')
  salespeople(@Query('date') date: string, @Req() req: AuthRequest) {
    const user: any = (req.user as any)?._doc || req.user;
    const ownSalespersonId =
      String(user?.role || '').toLowerCase() === 'staff'
        ? this.actor(req)
        : undefined;
    return this.service.salespeople(date, ownSalespersonId);
  }
  @Get('preview')
  preview(@Query() query: DailyReportPreviewQueryDto, @Req() req: AuthRequest) {
    this.assertSalespersonAccess(req, query.salespersonId);
    return this.service.preview(query.date, query.salespersonId);
  }
  @Post() create(@Body() dto: CreateDailyReportDto, @Req() req: AuthRequest) {
    this.assertSalespersonAccess(req, dto.salespersonId);
    return this.service.create(dto, this.actor(req));
  }
  @Get() list(@Query() q: DailyReportQueryDto): Promise<any> {
    return this.service.list(q);
  }
  @Get(':id') detail(@Param('id', ParseIdPipe) id: ID): Promise<any> {
    return this.service.detail(String(id));
  }
  @Patch(':id') update(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: UpdateDailyReportDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(String(id), dto, this.actor(req));
  }
  @Get(':id/export') async export(
    @Param('id', ParseIdPipe) id: ID,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.export(String(id));
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="daily-report-${String(id)}.xlsx"`,
    });
    return new StreamableFile(file);
  }
}
