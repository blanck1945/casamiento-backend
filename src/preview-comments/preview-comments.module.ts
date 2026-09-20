import { Module } from '@nestjs/common'
import { DbModule } from '../db/db.module'
import { PreviewCommentsController } from './preview-comments.controller'
import { PreviewCommentsService } from './preview-comments.service'

@Module({
  imports: [DbModule],
  controllers: [PreviewCommentsController],
  providers: [PreviewCommentsService],
})
export class PreviewCommentsModule {}
