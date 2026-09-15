// Embedded PostgreSQL test driver. The mutex models exclusive connections in this
// single-connection engine; deployment uses pg.Pool and PostgreSQL row locks.
import {PGlite} from '@electric-sql/pglite';
import {databaseFromPool} from '../server/db.mjs';
export async function testDatabase(){
 const pg=new PGlite(); await pg.waitReady;
 let tail=Promise.resolve();
 async function acquire(){let unlock;const next=new Promise(r=>unlock=r);const previous=tail;tail=next;await previous;return unlock}
 async function query(sql,params=[]){
  // Advisory locking is unnecessary in this single-process test engine.
  if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[],rowCount:0};
  const result=sql.includes('CREATE TABLE users') ? (await pg.exec(sql)).at(-1) : await pg.query(sql,params);
  return {rows:result.rows,rowCount:result.affectedRows??0};
 }
 return databaseFromPool({
  async query(sql,params){const release=await acquire();try{return await query(sql,params)}finally{release()}},
  async connect(){const release=await acquire();return {query,release}},
  end:()=>pg.close()
 });
}
