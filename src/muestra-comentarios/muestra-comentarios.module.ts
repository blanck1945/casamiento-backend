import { Module } from '@nestjs/common'
import { DbModule } from '../db/db.module'
import { MuestraComentariosController } from './muestra-comentarios.controller'
import { MuestraComentariosService } from './muestra-comentarios.service'

@Module({
  imports: [DbModule],
  controllers: [MuestraComentariosController],
  providers: [MuestraComentariosService],
})
export class MuestraComentariosModule {}
