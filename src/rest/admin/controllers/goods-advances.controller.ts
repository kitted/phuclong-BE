import {
  Body,
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
import { GoodsAdvancesService } from '../../../collection/goods-advances/goods-advances.service';
import {
  ChangeGoodsAdvanceStatusDto,
  CreateGoodsAdvanceDto,
  GoodsAdvanceQueryDto,
  UpdateGoodsAdvanceDto,
} from '../../../collection/goods-advances/dtos/goods-advances.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
@WarehouseController(['goods-advances'])
export class GoodsAdvancesController {
  constructor(private service: GoodsAdvancesService) {}
  private actor(req: AuthRequest) {
    const u: any = req.user,
      d = u?._doc || u;
    return String(d?.id || d?._id || '');
  }
  @Get() list(@Query() q: GoodsAdvanceQueryDto): Promise<any> {
    return this.service.findAll(q);
  }
  @Post() create(@Body() dto: CreateGoodsAdvanceDto, @Req() req: AuthRequest) {
    return this.service.create(dto, this.actor(req));
  }
  @Get(':id') detail(@Param('id', ParseIdPipe) id: ID): Promise<any> {
    return this.service.findOne(String(id));
  }
  @Patch(':id') update(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: UpdateGoodsAdvanceDto,
  ) {
    return this.service.update(String(id), dto);
  }
  @Patch(':id/status') status(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: ChangeGoodsAdvanceStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.changeStatus(String(id), dto, this.actor(req));
  }
  @Get(':id/export') async export(
    @Param('id', ParseIdPipe) id: ID,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.export(String(id));
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="goods-advance-${String(id)}.xlsx"`,
    });
    return new StreamableFile(file);
  }
}
