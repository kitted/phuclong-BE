import { Body, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { CreateWebsiteContentCategoryDto, UpdateWebsiteContentCategoryDto } from '../../../collection/website-contents/dtos/website-contents.dto';
import { WebsiteContentsService } from '../../../collection/website-contents/website-contents.service';
import { ID } from '../../../core/interfaces/id.interface';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['website-content-categories'])
export class WebsiteContentCategoriesController {
  constructor(private readonly service: WebsiteContentsService) {}
  private actor(req: AuthRequest): string { const user: any = req.user, doc = user?._doc || user; return String(doc?.id || doc?._id || ''); }
  @Post() @AdminOnly() create(@Body() dto: CreateWebsiteContentCategoryDto, @Req() req: AuthRequest): Promise<any> { return this.service.createCategory(dto, this.actor(req)); }
  @Get() @AdminOnly() list(): Promise<any> { return this.service.listCategories(false); }
  @Patch(':id') @AdminOnly() update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateWebsiteContentCategoryDto, @Req() req: AuthRequest): Promise<any> { return this.service.updateCategory(String(id), dto, this.actor(req)); }
  @Delete(':id') @AdminOnly() remove(@Param('id', ParseIdPipe) id: ID, @Req() req: AuthRequest): Promise<any> { return this.service.removeCategory(String(id), this.actor(req)); }
}
