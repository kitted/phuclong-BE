import { Body, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { AssignWebsiteOrderDto, ChangeWebsiteOrderStatusDto, ConvertWebsiteOrderDto, WebsiteOrderAdminQueryDto } from '../../../collection/website-orders/dtos/website-orders.dto';
import { WebsiteOrdersService } from '../../../collection/website-orders/website-orders.service';
import { ID } from '../../../core/interfaces/id.interface';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['website-orders'])
export class WebsiteOrdersController {
  constructor(private readonly service: WebsiteOrdersService) {}
  private actor(req: AuthRequest): string { const user: any = req.user, doc = user?._doc || user; return String(doc?.id || doc?._id || ''); }
  @Get() @AdminOnly() list(@Query() q: WebsiteOrderAdminQueryDto): Promise<any> { return this.service.adminList(q); }
  @Get(':id') @AdminOnly() detail(@Param('id', ParseIdPipe) id: ID): Promise<any> { return this.service.adminDetail(String(id)); }
  @Patch(':id/assign') @AdminOnly() assign(@Param('id', ParseIdPipe) id: ID, @Body() dto: AssignWebsiteOrderDto, @Req() req: AuthRequest): Promise<any> { return this.service.assign(String(id), dto, this.actor(req)); }
  @Patch(':id/status') @AdminOnly() status(@Param('id', ParseIdPipe) id: ID, @Body() dto: ChangeWebsiteOrderStatusDto, @Req() req: AuthRequest): Promise<any> { return this.service.changeStatus(String(id), dto, this.actor(req)); }
  @Patch(':id/convert-to-invoice') @AdminOnly() convert(@Param('id', ParseIdPipe) id: ID, @Body() dto: ConvertWebsiteOrderDto, @Req() req: AuthRequest): Promise<any> { return this.service.convertToInvoice(String(id), dto, this.actor(req)); }
}
