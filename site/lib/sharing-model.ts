export const SHARE_MAX_BYTES = 10 * 1024 * 1024;
export const SHARE_STORAGE_BYTES = 256 * 1024 * 1024;
export const SHARE_MAX_FILES = 100;
export const SHARE_COOKIE = "pdf-share-device";
export type SharedFile = { id: string; filename: string; size: number; createdAt: number; path: string };
