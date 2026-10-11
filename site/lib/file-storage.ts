import "server-only";
import { get, head, put, del, BlobNotFoundError } from "@vercel/blob";
export const files = {
  async put(path: string, data: Uint8Array) {
    return put(path, Buffer.from(data), { access: "private", contentType: "application/pdf", addRandomSuffix: false, allowOverwrite: false });
  },
  async delete(path: string) { await del(path); },
  async head(path: string) {
    try { const object = await head(path); return { size: object.size, httpEtag: object.etag }; }
    catch (error) { if (error instanceof BlobNotFoundError) return null; throw error; }
  },
  async get(path: string, options?: { range: { offset: number; length: number } }) {
    const object = await get(path, { access: "private", useCache: false });
    if (!object || object.statusCode !== 200) return null;
    if (!options?.range) return { size: object.blob.size, httpEtag: object.blob.etag, body: object.stream };
    // Stored PDFs are immutable and validated against the 10 MiB upload limit.
    const bytes = new Uint8Array(await new Response(object.stream).arrayBuffer());
    const { offset, length } = options.range;
    return { size: object.blob.size, httpEtag: object.blob.etag, body: bytes.slice(offset, offset + length) };
  },
};
