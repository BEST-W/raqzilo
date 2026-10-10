export type OwnerIdentity={userId:string;email:string};
export async function resolveOwner(database:D1Database,user:OwnerIdentity|null,verifiedOwnerEmail:string|undefined):Promise<boolean>{
  if(!user)return false;
  const owner=await database.prepare("SELECT user_id FROM site_owner WHERE id = ?").bind("main").first<{user_id:string}>();
  if(owner)return owner.user_id===user.userId;
  if(!verifiedOwnerEmail||user.email.toLowerCase()!==verifiedOwnerEmail.toLowerCase())return false;
  await database.prepare("INSERT OR IGNORE INTO site_owner (id, user_id, created_at) VALUES (?, ?, ?)").bind("main",user.userId,new Date().toISOString()).run();
  const bound=await database.prepare("SELECT user_id FROM site_owner WHERE id = ?").bind("main").first<{user_id:string}>();
  return bound?.user_id===user.userId;
}
