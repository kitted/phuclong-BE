import { Body, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { CreateWebsiteContentDto, UpdateWebsiteContentDto, WebsiteContentQueryDto } from '../../../collection/website-contents/dtos/website-contents.dto';
import { WebsiteContentsService } from '../../../collection/website-contents/website-contents.service';
import { ID } from '../../../core/interfaces/id.interface';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['website-contents'])
export class WebsiteContentsController {
  constructor(private readonly service: WebsiteContentsService) {}
  private actor(req: AuthRequest): string { const user: any = req.user, doc = user?._doc || user; return String(doc?.id || doc?._id || ''); }
  @Post() @AdminOnly() create(@Body() dto: CreateWebsiteContentDto, @Req() req: AuthRequest): Promise<any> { return this.service.create(dto, this.actor(req)); }
  @Get() @AdminOnly() list(@Query() q: WebsiteContentQueryDto): Promise<any> { return this.service.adminList(q); }
  @Get(':id') @AdminOnly() detail(@Param('id', ParseIdPipe) id: ID): Promise<any> { return this.service.adminDetail(String(id)); }
  @Patch(':id') @AdminOnly() update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateWebsiteContentDto, @Req() req: AuthRequest): Promise<any> { return this.service.update(String(id), dto, this.actor(req)); }
  @Delete(':id') @AdminOnly() remove(@Param('id', ParseIdPipe) id: ID, @Req() req: AuthRequest): Promise<any> { return this.service.remove(String(id), this.actor(req)); }
}
