import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common'
import type { Response } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Express } from 'express'
import { memoryStorage } from 'multer'
import { AlbumFotosService } from './album-fotos.service'
import { MAX_UPLOAD_BYTES } from './album-upload.limits'

@ApiTags('album-fotos')
@Controller('album-fotos')
export class AlbumFotosController {
  constructor(private readonly album: AlbumFotosService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Subir foto o video al álbum (público)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        token: { type: 'string', description: 'Token de invitación (opcional, para asociar al invitado)' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File, @Body('token') token?: string) {
    return this.album.upload(file, token?.trim() || undefined)
  }

  @Get()
  @ApiOperation({ summary: 'Listar fotos/videos del álbum (para librería virtual)' })
  list(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50
    return this.album.list(Number.isFinite(n) ? n : 50)
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Descargar/ver un archivo del álbum' })
  async file(@Param('id') id: string, @Res() res: Response) {
    await this.album.serveFile(Number(id), res)
  }
}
