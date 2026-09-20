import { Module } from '@nestjs/common'
import { CommsModule } from '../comms/comms.module'
import { DbModule } from '../db/db.module'
import { InvitationsController } from './invitations.controller'
import { InvitationsService } from './invitations.service'

@Module({
  imports: [DbModule, CommsModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
