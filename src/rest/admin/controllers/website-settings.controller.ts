import { Body, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { CreateWebsiteSettingDto, UpdateWebsiteSettingDto } from '../../../collection/website-contents/dtos/website-contents.dto';
import { WebsiteContentsService } from '../../../collection/website-contents/website-contents.service';
import { ID } from '../../../core/interfaces/id.interface';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['website-settings'])
export class WebsiteSettingsController {
  constructor(private readonly service: WebsiteContentsService) {}
  private actor(req: AuthRequest): string { const user: any = req.user, doc = user?._doc || user; return String(doc?.id || doc?._id || ''); }
  @Post() @AdminOnly() create(@Body() dto: CreateWebsiteSettingDto, @Req() req: AuthRequest): Promise<any> { return this.service.createSetting(dto, this.actor(req)); }
  @Get() @AdminOnly() list(@Query('group') group?: string): Promise<any> { return this.service.listSettings(false, group); }
  @Get(':id') @AdminOnly() detail(@Param('id', ParseIdPipe) id: ID): Promise<any> { return this.service.settingDetail(String(id)); }
  @Patch(':id') @AdminOnly() update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateWebsiteSettingDto, @Req() req: AuthRequest): Promise<any> { return this.service.updateSetting(String(id), dto, this.actor(req)); }
  @Delete(':id') @AdminOnly() remove(@Param('id', ParseIdPipe) id: ID, @Req() req: AuthRequest): Promise<any> { return this.service.removeSetting(String(id), this.actor(req)); }
}
