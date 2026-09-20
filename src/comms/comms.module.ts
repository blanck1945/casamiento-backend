import { Module } from '@nestjs/common'
import { CommsService } from './comms.service'

@Module({
  providers: [CommsService],
  exports: [CommsService],
})
export class CommsModule {}
