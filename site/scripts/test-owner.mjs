import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { resolveOwner } from '../lib/owner-policy.ts';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync('drizzle/0000_uneven_owl.sql','utf8').replaceAll('--> statement-breakpoint',''));
const binding={
 prepare(sql){
  const statement=sqlite.prepare(sql);
  return {bind(...args){return {
   async first(){return statement.get(...args)||null;},
   async run(){const result=statement.run(...args);return {meta:{changes:Number(result.changes)}};}
  };}};
 }
};
const ownerEmail='owner@example.test';
assert.equal(await resolveOwner(binding,null,ownerEmail),false);
assert.equal(await resolveOwner(binding,{userId:'stranger',email:'other@example.test'},ownerEmail),false);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM site_owner').get().n,0);
assert.equal(await resolveOwner(binding,{userId:'owner-site-id',email:'OWNER@example.test'},ownerEmail),true);
assert.equal(await resolveOwner(binding,{userId:'different-id',email:ownerEmail},ownerEmail),false);
assert.equal(await resolveOwner(binding,{userId:'owner-site-id',email:'changed@example.test'},ownerEmail),true);
assert.equal(await resolveOwner(binding,{userId:'stranger',email:ownerEmail},undefined),false);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM site_owner').get().n,1);
console.log('PASS: anonymous and stranger denied, verified owner bootstrap, stable user ID, no first-visitor takeover');
sqlite.close();
