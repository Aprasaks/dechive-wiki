import assert from 'node:assert/strict'
import {Pool} from 'pg'
import {getMigrations} from 'better-auth/db/migration'

// Disposable CI database only: exercise real auth and row isolation.
const admin=new Pool({connectionString:process.env.DATABASE_URL})
const {memberAuth,memberDatabase}=await import('../lib/member-auth')
const migrations=await getMigrations(memberAuth.options)
await migrations.runMigrations()
const suffix=Date.now().toString()
const first=await memberAuth.api.signUpEmail({body:{name:'Reader A',email:`a-${suffix}@example.test`,password:'reader-test-password-123'}})
const second=await memberAuth.api.signUpEmail({body:{name:'Reader B',email:`b-${suffix}@example.test`,password:'reader-test-password-456'}})
assert.ok(first.user.id&&second.user.id&&first.user.id!==second.user.id)
await assert.rejects(()=>memberAuth.api.signInEmail({body:{email:first.user.email,password:'wrong-password'}}))
const signed=await memberAuth.api.signInEmail({body:{email:first.user.email,password:'reader-test-password-123'}})
assert.equal(signed.user.id,first.user.id)
await admin.query('CREATE ROLE wiki_member_ci LOGIN PASSWORD \'member-ci-only\'')
await admin.query('GRANT USAGE ON SCHEMA reader_member TO wiki_member_ci')
await admin.query('GRANT SELECT, INSERT, DELETE ON reader_member.bookmarks TO wiki_member_ci')
await admin.query('GRANT USAGE ON SCHEMA public TO wiki_member_ci')
await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wiki_member_ci')
const scoped=new Pool({connectionString:process.env.MEMBER_BOOKMARK_TEST_URL})
async function withUser<T>(id:string,fn:(client:import('pg').PoolClient)=>Promise<T>){const c=await scoped.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('reader_member.user_id',$1,true)",[id]);const value=await fn(c);await c.query('COMMIT');return value}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
const article='31ecf978-4412-4de1-a056-2b83c2533372'
await withUser(first.user.id,c=>c.query('INSERT INTO reader_member.bookmarks(user_id,entity_id) VALUES($1,$2)',[first.user.id,article]))
assert.equal((await withUser(first.user.id,c=>c.query('SELECT * FROM reader_member.bookmarks'))).rowCount,1)
assert.equal((await withUser(second.user.id,c=>c.query('SELECT * FROM reader_member.bookmarks'))).rowCount,0)
assert.equal((await withUser(second.user.id,c=>c.query('DELETE FROM reader_member.bookmarks WHERE entity_id=$1',[article]))).rowCount,0)
assert.equal((await withUser(first.user.id,c=>c.query('DELETE FROM reader_member.bookmarks WHERE entity_id=$1',[article]))).rowCount,1)
console.log('PASS: account signup, login, incorrect password, bookmark isolation and removal')
await scoped.end();await memberDatabase.end();await admin.end()
