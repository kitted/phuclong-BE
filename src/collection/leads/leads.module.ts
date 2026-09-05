import { Module } from '@nestjs/common';
import { TypegooseModule } from 'nestjs-typegoose';
import { Leads } from './schemas/leads.schema';
import { LeadsService } from './leads.service';
@Module({ imports: [TypegooseModule.forFeature([Leads])], providers: [LeadsService], exports: [LeadsService] })
export class LeadsModule {}
