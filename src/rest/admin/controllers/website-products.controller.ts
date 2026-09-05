import { BadRequestException, Body, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { CreateWebsiteProductDto, MapWebsiteProductDto, UpdateWebsiteProductDto } from '../../../collection/website-orders/dtos/website-orders.dto';
import { WebsiteOrdersService } from '../../../collection/website-orders/website-orders.service';
import { ID } from '../../../core/interfaces/id.interface';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['website-products'])
export class WebsiteProductsController {
  constructor(private readonly service: WebsiteOrdersService) {}
  private actor(req: AuthRequest): string { const user: any = req.user, doc = user?._doc || user; return String(doc?.id || doc?._id || ''); }
  @Get('categories') @AdminOnly() categories(): Promise<any> { return this.service.adminProductCategories(); }
  @Post('images/upload') @AdminOnly()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(new BadRequestException('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP'), false);
      callback(null, true);
    },
  }))
  uploadImage(@UploadedFile() file: any): Promise<any> { return this.service.uploadWebsiteProductImage(file); }
  @Post() @AdminOnly() create(@Body() dto: CreateWebsiteProductDto, @Req() req: AuthRequest): Promise<any> { return this.service.createWebsiteProduct(dto, this.actor(req)); }
  @Get() @AdminOnly() list(@Query() query: any): Promise<any> { return this.service.adminProducts(query); }
  @Get(':id') @AdminOnly() detail(@Param('id', ParseIdPipe) id: ID): Promise<any> { return this.service.adminProduct(String(id)); }
  @Patch(':id') @AdminOnly() update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateWebsiteProductDto, @Req() req: AuthRequest): Promise<any> { return this.service.updateWebsiteProduct(String(id), dto, this.actor(req)); }
  @Delete(':id') @AdminOnly() remove(@Param('id', ParseIdPipe) id: ID, @Req() req: AuthRequest): Promise<any> { return this.service.removeWebsiteProduct(String(id), this.actor(req)); }
  @Patch(':id/map-inventory') @AdminOnly()
  map(@Param('id', ParseIdPipe) id: ID, @Body() dto: MapWebsiteProductDto): Promise<any> {
    return this.service.mapInventoryProduct(String(id), dto.inventoryProductId || null);
  }
}
