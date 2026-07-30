import { Get, Param, Patch, Query, Req, Sse } from '@nestjs/common';
import { WarehouseController } from '../decorators/warehouse';
import { NotificationsService } from '../../../collection/notifications/notifications.service';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';

@WarehouseController(['notifications'])
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  private actor(request: AuthRequest) { const user: any = request.user; const doc = user?._doc || user; return { id: String(doc?.id || doc?._id || ''), role: doc?.role }; }
  @Get() findAll(@Query() query: any, @Req() request: AuthRequest): Promise<any> { return this.service.findAll(this.actor(request), query); }
  @Get('summary') summary(@Req() request: AuthRequest) { return this.service.summary(this.actor(request)); }
  @Patch('read-all') readAll(@Req() request: AuthRequest) { return this.service.readAll(this.actor(request)); }
  @Patch(':id/read') read(@Param('id') id: string, @Req() request: AuthRequest) { return this.service.read(id, this.actor(request)); }
  @Sse('stream') stream(@Req() request: AuthRequest) { return this.service.stream(this.actor(request)); }
}
