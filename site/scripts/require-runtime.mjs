if (process.env.VERCEL) {
  const missing = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "BLOB_STORE_ID"].filter(name => !process.env[name]);
  if (missing.length) throw new Error("Connect the Turso database and private Vercel Blob store before deploying: " + missing.join(", "));
}
