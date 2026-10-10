declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    FILES?: R2Bucket;
    OWNER_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
