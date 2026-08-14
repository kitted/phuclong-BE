import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { WebsiteOrdersModule } from '../website-orders/website-orders.module';
import { WebsiteContents } from './schemas/website-contents.schema';
import { WebsiteContentCategories } from './schemas/website-content-categories.schema';
import { WebsiteSettings } from './schemas/website-settings.schema';
import { WebsiteContentsService } from './website-contents.service';
import { WebsiteDataImportService } from './website-data-import.service';
import { WebsiteProductCategories, WebsiteProducts } from '../website-orders/schemas/website-products.schema';

@Module({
  imports: [
    TypegooseModule.forFeature([
      WebsiteContents,
      WebsiteContentCategories,
      WebsiteSettings,
      WebsiteProducts,
      WebsiteProductCategories,
    ]),
    WebsiteOrdersModule,
  ],
  providers: [WebsiteContentsService, WebsiteDataImportService],
  exports: [WebsiteContentsService, WebsiteDataImportService],
})
export class WebsiteContentsModule {}
