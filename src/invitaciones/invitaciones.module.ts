import { Module } from '@nestjs/common'
import { DbModule } from '../db/db.module'
import { InvitacionesController } from './invitaciones.controller'
import { InvitacionesService } from './invitaciones.service'

@Module({
  imports: [DbModule],
  controllers: [InvitacionesController],
  providers: [InvitacionesService],
  exports: [InvitacionesService],
})
export class InvitacionesModule {}
