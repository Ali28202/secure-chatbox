import { env } from '../env';

class S3StorageService {
  private readonly client = new Bun.S3Client({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  });

  get bucket(): string {
    return env.S3_BUCKET;
  }

  async uploadFile(fileBuffer: Uint8Array, mimeType: string, fileName: string): Promise<string> {
    const key = `${new Date().toISOString().slice(0, 7)}/${Bun.randomUUIDv7()}/${fileName}`;

    await this.client.write(key, fileBuffer, { type: mimeType });

    return key;
  }

  getSignedUrl(s3ObjectKey: string, fileType: string): string {
    return this.client.presign(s3ObjectKey, {
      method: 'GET',
      expiresIn: env.S3_URL_TTL,
      type: fileType,
    });
  }

  async deleteFile(s3ObjectKey: string): Promise<boolean> {
    try {
      await this.client.delete(s3ObjectKey);
      return true;
    } catch (error) {
      console.error('[s3] could not delete', s3ObjectKey, error);
      return false;
    }
  }
}

export const s3Storage = new S3StorageService();
