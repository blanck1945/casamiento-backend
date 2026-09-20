import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger'
import { MuestraComentariosService } from './muestra-comentarios.service'

class CreateComentarioDto {
  @ApiProperty({ example: 'rsvp' })
  sectionId!: string

  @ApiProperty({ example: 'RSVP' })
  sectionLabel!: string

  @ApiProperty({ example: 'Mover el botón un poco más abajo' })
  texto!: string

  @ApiProperty({ example: 42.5 })
  xPct!: number

  @ApiProperty({ example: 63.2 })
  yPct!: number
}

@ApiTags('muestra-comentarios')
@Controller('muestra-comentarios')
export class MuestraComentariosController {
  constructor(private readonly comentarios: MuestraComentariosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar comentarios de testing de /muestra' })
  list() {
    return this.comentarios.list()
  }

  @Post()
  @ApiOperation({ summary: 'Crear un comentario "pin" en /muestra' })
  create(@Body() body: CreateComentarioDto) {
    return this.comentarios.create(body)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borrar un comentario' })
  remove(@Param('id') id: string) {
    return this.comentarios.remove(Number(id))
  }

  @Delete()
  @ApiOperation({ summary: 'Borrar todos los comentarios de testing' })
  clear() {
    return this.comentarios.clear()
  }
}
