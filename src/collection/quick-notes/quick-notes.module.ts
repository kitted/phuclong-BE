import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { QuickNotes } from './schemas/quick-notes.schema';
import { QuickNotesService } from './quick-notes.service';

@Module({
  imports: [TypegooseModule.forFeature([QuickNotes])],
  providers: [QuickNotesService],
  exports: [QuickNotesService],
})
export class QuickNotesModule {}
