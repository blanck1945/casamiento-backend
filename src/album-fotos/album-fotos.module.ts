import { Module } from '@nestjs/common'
import { DbModule } from '../db/db.module'
import { InvitacionesModule } from '../invitaciones/invitaciones.module'
import { AlbumFotosController } from './album-fotos.controller'
import { AlbumFotosService } from './album-fotos.service'
import { AlbumS3Storage } from './album-s3.storage'

@Module({
  imports: [DbModule, InvitacionesModule],
  controllers: [AlbumFotosController],
  providers: [AlbumFotosService, AlbumS3Storage],
})
export class AlbumFotosModule {}
