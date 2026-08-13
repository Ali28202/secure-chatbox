import { env } from '../env';

/**
 * The object store, behind one small class.
 *
 * Attachments do not live in the database and they do not live on the API's
 * disk. They live in a bucket somebody else runs — AWS, Arvan, or an
 * S3-compatible server on the university's own network — and everything this
 * platform knows about it arrives as environment variables. There is no service
 * in `compose.yml` to start and nothing here creates a bucket: the bucket exists
 * before the API does, and the API is only ever a client of it.
 *
 * Three methods, matching the class diagram, and nothing else is exported. The
 * reason for the narrow surface is that every other module should be unable to
 * express "read the whole bucket" or "make this object public" — those are not
 * operations this platform has.
 *
 * `Bun.S3Client` is built into the runtime, so this costs no dependency. It
 * speaks SigV4, which is what makes the last method interesting: a *presigned*
 * URL carries its own authorization and its own expiry, so the bucket can refuse
 * anonymous reads while a browser still fetches an image directly from it. The
 * API never becomes a byte pump, and a leaked URL is worthless within minutes.
 */
class S3StorageService {
  /**
   * One client for the process. It holds credentials and no connection, so
   * this is configuration rather than a pool — there is nothing to close.
   */
  private readonly client = new Bun.S3Client({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    // Empty means AWS, which the client addresses from the region alone.
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  });

  /** The bucket every key below belongs to — stored beside the key on the row. */
  get bucket(): string {
    return env.S3_BUCKET;
  }

  /**
   * Writes an object and returns the key it was written under.
   *
   * The key is chosen here, never by the caller and never by the client that
   * uploaded the file, so there is no path to traverse and no object to
   * overwrite. Its shape is `<yyyy-mm>/<uuidv7>/<display name>`:
   *
   *   - the month prefix keeps a listing of a semester's uploads navigable,
   *   - the UUIDv7 makes the key unguessable and sorted by upload time,
   *   - the trailing name is what the browser saves the file as.
   *
   * That last segment is the reason `fileName` is a parameter at all, which the
   * class diagram does not show. Bun's presigner cannot set
   * `response-content-disposition`, and `<a download>` is ignored across
   * origins — so the key's final segment is the *only* thing left that decides
   * the downloaded filename. Without it every attachment would save as a UUID.
   * The caller has already reduced the name to something safe to put in a path.
   */
  async uploadFile(fileBuffer: Uint8Array, mimeType: string, fileName: string): Promise<string> {
    const key = `${new Date().toISOString().slice(0, 7)}/${Bun.randomUUIDv7()}/${fileName}`;

    await this.client.write(key, fileBuffer, { type: mimeType });

    return key;
  }

  /**
   * A URL the browser may fetch this one object from, for a few minutes.
   *
   * Signed for `GET` and for nothing else, so it cannot be turned into a write,
   * and scoped to the single key it names. `type` is what makes the store send
   * the right `Content-Type` back, which is what decides whether an image
   * renders inline or arrives as a download.
   *
   * Synchronous: signing is a local HMAC, not a request.
   */
  getSignedUrl(s3ObjectKey: string, fileType: string): string {
    return this.client.presign(s3ObjectKey, {
      method: 'GET',
      expiresIn: env.S3_URL_TTL,
      type: fileType,
    });
  }

  /**
   * Removes an object. `true` if the store accepted the deletion.
   *
   * Never throws. Callers are finishing something that has already succeeded —
   * a message deleted, a transaction rolled back — and an object store that is
   * briefly unreachable must not turn that into a failed request. What is left
   * behind is an unreferenced object: it costs storage and nothing else, and no
   * row points at it any more.
   */
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
