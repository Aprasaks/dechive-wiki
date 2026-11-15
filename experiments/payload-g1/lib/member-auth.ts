import {betterAuth} from 'better-auth'
import {Pool} from 'pg'

// Reader identity has its own database credentials, never the editorial role.
const database = new Pool({connectionString:process.env.MEMBER_DATABASE_URL, max:4})
export const memberAuth = betterAuth({
  database,
  baseURL:process.env.MEMBER_AUTH_URL,
  basePath:'/api/member/auth',
  secret:process.env.MEMBER_AUTH_SECRET,
  emailAndPassword:{enabled:true, minPasswordLength:12},
  advanced:{useSecureCookies:process.env.NODE_ENV==='production', cookiePrefix:'wiki_reader'},
  rateLimit:{enabled:true,window:60,max:30,storage:'database'},
})
export {database as memberDatabase}
