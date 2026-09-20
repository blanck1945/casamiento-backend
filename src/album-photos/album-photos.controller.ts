import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common'
import type { Response } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Express } from 'express'
import { memoryStorage } from 'multer'
import { AlbumPhotosService } from './album-photos.service'
import { MAX_UPLOAD_BYTES } from './album-upload.limits'

@ApiTags('album-photos')
@Controller('album-photos')
export class AlbumPhotosController {
  constructor(private readonly album: AlbumPhotosService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload photo or video to the album (public)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        token: { type: 'string', description: 'Invitation token (optional, links upload to guest)' },
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
  @ApiOperation({ summary: 'List album photos and videos' })
  list(@Query('limit') limit?: string) {
    const n = limit ? Number(limit) : 50
    return this.album.list(Number.isFinite(n) ? n : 50)
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Download or stream an album file' })
  async file(@Param('id') id: string, @Res() res: Response) {
    await this.album.serveFile(Number(id), res)
  }
}
