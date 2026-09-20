import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'

@Injectable()
export class AlbumS3Storage {
  private readonly log = new Logger(AlbumS3Storage.name)
  private client: S3Client | null = null

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.bucket)
  }

  private get bucket(): string {
    return this.config.get<string>('ALBUM_S3_BUCKET', '').trim()
  }

  private get region(): string {
    return this.config.get<string>('AWS_REGION', 'us-east-1').trim() || 'us-east-1'
  }

  private get prefix(): string {
    return (this.config.get<string>('ALBUM_S3_PREFIX', 'uploads') || 'uploads').replace(/^\/+|\/+$/g, '')
  }

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({ region: this.region })
    }
    return this.client
  }

  objectKey(uid: string, ext: string): string {
    const date = new Date().toISOString().slice(0, 10)
    return `${this.prefix}/${date}/${uid}${ext}`
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!this.enabled) throw new Error('ALBUM_S3_BUCKET no configurado')
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    )
    this.log.log(`subido s3://${this.bucket}/${key}`)
  }

  async signedGetUrl(key: string, expiresInSec = 3600): Promise<string> {
    if (!this.enabled) throw new Error('ALBUM_S3_BUCKET no configurado')
    return getSignedUrl(
      this.getClient(),
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSec },
    )
  }

  parseStorageKey(storageKey: string): { backend: 's3' | 'local'; key: string } {
    if (storageKey.startsWith('s3:')) {
      return { backend: 's3', key: storageKey.slice(3) }
    }
    if (storageKey.startsWith('local:')) {
      return { backend: 'local', key: storageKey.slice(6) }
    }
    return { backend: 'local', key: storageKey }
  }
}
