import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { log } from './log.js';

// ============================================================
// Pluggable media storage — local disk by default, Cloudflare R2 when
// the R2_* env vars are set. Twilio MMS needs a public HTTPS URL; both
// backends return one.
//
// Env keys (set all five to switch on R2):
//   R2_ACCOUNT_ID            cloudflare account id
//   R2_ACCESS_KEY_ID         R2 API token Access Key
//   R2_SECRET_ACCESS_KEY     R2 API token Secret Key
//   R2_BUCKET                bucket name
//   R2_PUBLIC_BASE           https://media.wrkphn.com  (custom domain on bucket,
//                            OR the public r2.dev URL of the bucket)
// ============================================================

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const LOCAL_MEDIA_DIR = path.join(DATA_DIR, 'media');
fs.mkdirSync(LOCAL_MEDIA_DIR, { recursive: true });
export { LOCAL_MEDIA_DIR as MEDIA_DIR };

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
}

interface R2Config {
  client: S3Client;
  bucket: string;
  publicBase: string;
}
function r2(): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_BASE) {
    return null;
  }
  return {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    }),
    bucket: R2_BUCKET,
    publicBase: R2_PUBLIC_BASE.trim().replace(/\/$/, ''),
  };
}

export function storageBackend(): 'r2' | 'local' {
  return r2() ? 'r2' : 'local';
}

/**
 * Save raw bytes and return a public URL. Tries R2 first when configured;
 * falls back to local disk on R2 error so a misconfigured bucket doesn't
 * brick MMS sends.
 */
export async function saveBytes(buf: Buffer, ext = 'png', mime?: string): Promise<{ key: string; url: string }> {
  const key = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const cfg = r2();
  if (cfg) {
    try {
      await cfg.client.send(new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        // Cast to Uint8Array sidesteps the SharedArrayBuffer typing edge case
        // in newer @types/node where `Buffer` no longer extends Uint8Array<ArrayBuffer>.
        Body: new Uint8Array(buf),
        ContentType: mime || mimeForExt(ext),
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      return { key, url: `${cfg.publicBase}/${key}` };
    } catch (e) {
      log.error('storage.r2', 'PUT failed, falling back to local', e);
      // fall through
    }
  }
  fs.writeFileSync(path.join(LOCAL_MEDIA_DIR, key), buf);
  return { key, url: `${publicBase()}/media/${key}` };
}

/** Best-effort delete. Tries R2 first if the URL looks like R2; else local. */
export async function deleteByUrl(url: string): Promise<void> {
  if (!url) return;
  const cfg = r2();
  if (cfg && url.startsWith(cfg.publicBase + '/')) {
    const key = url.slice(cfg.publicBase.length + 1);
    try { await cfg.client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key })); }
    catch (e) { log.warn('storage.r2', `DELETE failed for ${key}`, e); }
    return;
  }
  // Local fallback: derive filename from /media/<file>.
  const m = url.match(/\/media\/([^/?#]+)$/);
  if (m) { try { fs.unlinkSync(path.join(LOCAL_MEDIA_DIR, m[1])); } catch { /* already gone */ } }
}

function mimeForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'png')  return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'gif')  return 'image/gif';
  if (e === 'webp') return 'image/webp';
  if (e === 'mp4')  return 'video/mp4';
  if (e === 'mov')  return 'video/quicktime';
  if (e === 'webm') return 'video/webm';
  return 'application/octet-stream';
}
