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
import { AdminController } from '../decorators/swagger';
import { PromotionActivationsService } from '../../../collection/promotion-activations/promotion-activations.service';
import {
  ChangePromotionActivationStatusDto,
  PromotionActivationQueryDto,
  SaveManualPromotionCodeDto,
} from '../../../collection/promotion-activations/dtos/promotion-activations.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { AdminOnly } from '../decorators/admin-only';
@AdminController(['promotion-activations'])
export class PromotionActivationsController {
  constructor(private readonly service: PromotionActivationsService) {}
  private actor(req: AuthRequest): string {
    const user: any = req.user,
      doc = user?._doc || user;
    return String(doc?.id || doc?._id || '');
  }
  @Get() findAll(@Query() query: PromotionActivationQueryDto): Promise<any> {
    return this.service.findAll(query);
  }
  @Get('export')
  @AdminOnly()
  async export(
    @Query() query: PromotionActivationQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.service.export(query);
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ma-khuyen-mai.xlsx"',
    });
    return new StreamableFile(file);
  }
  @Post('manual')
  @AdminOnly()
  createManual(
    @Body() dto: SaveManualPromotionCodeDto,
    @Req() req: AuthRequest,
  ): Promise<any> {
    return this.service.createManual(dto, this.actor(req));
  }
  @Get('code/:code') byCode(@Param('code') code: string): Promise<any> {
    return this.service.findOne(code, true);
  }
  @Get(':id') findOne(@Param('id') id: string): Promise<any> {
    return this.service.findOne(id);
  }
  @Patch(':id/manual')
  @AdminOnly()
  updateManual(
    @Param('id') id: string,
    @Body() dto: SaveManualPromotionCodeDto,
    @Req() req: AuthRequest,
  ): Promise<any> {
    return this.service.updateManual(id, dto, this.actor(req));
  }
  @Patch(':id/status') status(
    @Param('id') id: string,
    @Body() dto: ChangePromotionActivationStatusDto,
    @Req() req: AuthRequest,
  ): Promise<any> {
    return this.service.changeStatus(
      id,
      dto,
      String((req.user as any)?.id || (req.user as any)?._id || ''),
    );
  }
}
