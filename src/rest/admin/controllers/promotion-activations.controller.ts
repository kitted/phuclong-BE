import { Body, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { AdminController } from '../decorators/swagger';
import { PromotionActivationsService } from '../../../collection/promotion-activations/promotion-activations.service';
import { ChangePromotionActivationStatusDto, PromotionActivationQueryDto } from '../../../collection/promotion-activations/dtos/promotion-activations.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
@AdminController(['promotion-activations'])
export class PromotionActivationsController {
  constructor(private readonly service: PromotionActivationsService) {}
  @Get() findAll(@Query() query: PromotionActivationQueryDto): Promise<any> { return this.service.findAll(query); }
  @Get('code/:code') byCode(@Param('code') code: string): Promise<any> { return this.service.findOne(code, true); }
  @Get(':id') findOne(@Param('id') id: string): Promise<any> { return this.service.findOne(id); }
  @Patch(':id/status') status(@Param('id') id: string, @Body() dto: ChangePromotionActivationStatusDto, @Req() req: AuthRequest): Promise<any> { return this.service.changeStatus(id, dto, String((req.user as any)?.id || (req.user as any)?._id || '')); }
}
