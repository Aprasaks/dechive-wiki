// Run only with the dedicated member database migration credentials.
import {getMigrations} from 'better-auth/db/migration'
if(!process.env.MEMBER_DATABASE_URL || !process.env.MEMBER_AUTH_SECRET || !process.env.MEMBER_AUTH_URL){
 throw new Error('Dedicated member database, authentication URL and secret are required')
}
const {memberAuth,memberDatabase}=await import('../lib/member-auth')
try{
 const migration=await getMigrations(memberAuth.options)
 await migration.runMigrations()
 console.log('Member authentication tables are ready')
}finally{await memberDatabase.end()}
