import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {testDatabase} from './pg-helper.mjs';
import {migrate} from '../server/db.mjs';
test('Suspension migration preserves an existing store and defaults to active',async()=>{
 const db=await testDatabase();
 try{
  await db.query(readFileSync(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
  await db.query('CREATE TABLE schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  await db.query('INSERT INTO schema_migrations(version) VALUES(1)');
  const data=JSON.stringify({products:[{name:'Existing inventory'}],sales:[{total:500}]});
  await db.prepare('INSERT INTO vendors(id,owner_name,business_type,data) VALUES(?,?,?,?)').run('legacy','Owner','General store',data);
  await migrate(db);await migrate(db);
  const row=await db.prepare('SELECT * FROM vendors WHERE id=?').get('legacy');
  assert.equal(row.data,data);assert.equal(row.suspended,false);assert.equal(row.version,0);
 }finally{await db.close()}
});
