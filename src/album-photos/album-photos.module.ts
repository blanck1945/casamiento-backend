import { Module } from '@nestjs/common'
import { DbModule } from '../db/db.module'
import { InvitationsModule } from '../invitations/invitations.module'
import { AlbumPhotosController } from './album-photos.controller'
import { AlbumPhotosService } from './album-photos.service'
import { AlbumS3Storage } from './album-s3.storage'

@Module({
  imports: [DbModule, InvitationsModule],
  controllers: [AlbumPhotosController],
  providers: [AlbumPhotosService, AlbumS3Storage],
})
export class AlbumPhotosModule {}
