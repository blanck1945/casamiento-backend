import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger'
import { InvitacionesService, type EstadoInvitacion } from './invitaciones.service'

class CreateInvitacionDto {
  @ApiProperty({ example: 'María López' })
  nombre!: string

  @ApiPropertyOptional({ example: false, description: '¿Puede venir con pareja/+1?' })
  permitePareja?: boolean
}

class RsvpDto {
  @ApiProperty({ example: 'si', enum: ['si', 'no', 'aun_no_lo_se'] })
  estado!: EstadoInvitacion

  @ApiPropertyOptional({ example: 'Carlos García', description: 'Solo aplica si la invitación permite pareja y confirma sí' })
  nombreAcompanante?: string | null

  @ApiProperty({ example: false, description: '¿Tiene restricciones alimentarias?' })
  restriccionesAlimentariasSi!: boolean

  @ApiPropertyOptional({ example: 'Celíaco', description: 'Detalle si restriccionesAlimentariasSi es true' })
  restriccionesAlimentarias?: string | null
}

@ApiTags('invitaciones')
@Controller('invitaciones')
export class InvitacionesController {
  constructor(private readonly invitaciones: InvitacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar invitaciones (dashboard)' })
  list() {
    return this.invitaciones.list()
  }

  @Post()
  @ApiOperation({ summary: 'Crear invitación + token único' })
  create(@Body() body: CreateInvitacionDto) {
    return this.invitaciones.create(body.nombre, !!body.permitePareja)
  }

  @Get('por-token/:token')
  @ApiOperation({ summary: 'Obtener invitación pública por token' })
  getByToken(@Param('token') token: string) {
    return this.invitaciones.getByToken(token)
  }

  @Patch('por-token/:token/rsvp')
  @ApiOperation({ summary: 'Confirmar asistencia (RSVP) por token' })
  rsvp(@Param('token') token: string, @Body() body: RsvpDto) {
    return this.invitaciones.rsvp(token, {
      estado: body.estado,
      nombreAcompanante: body.nombreAcompanante,
      restriccionesAlimentariasSi: body.restriccionesAlimentariasSi,
      restriccionesAlimentarias: body.restriccionesAlimentarias,
    })
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borrar (soft-delete) una invitación' })
  remove(@Param('id') id: string) {
    return this.invitaciones.softDelete(Number(id))
  }
}
