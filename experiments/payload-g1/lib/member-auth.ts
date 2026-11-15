import {betterAuth} from 'better-auth'
import {Pool} from 'pg'
import {SESv2Client,SendEmailCommand} from '@aws-sdk/client-sesv2'

// Reader identity has its own database credentials, never the editorial role.
const database = new Pool({connectionString:process.env.MEMBER_DATABASE_URL, max:4})
export const memberAuth = betterAuth({
  database,
  baseURL:process.env.MEMBER_AUTH_URL,
  basePath:'/api/member/auth',
  secret:process.env.MEMBER_AUTH_SECRET,
  emailAndPassword:{enabled:true, minPasswordLength:12,
   sendResetPassword:async({user,url})=>{
    const from=process.env.MEMBER_EMAIL_FROM
    if(!from)throw new Error('Account email sender is not configured')
    const ses=new SESv2Client({region:process.env.MEMBER_EMAIL_REGION || 'ap-northeast-2'})
    await ses.send(new SendEmailCommand({FromEmailAddress:from,Destination:{ToAddresses:[user.email]},Content:{Simple:{Subject:{Data:'Reset your DECHIVE.WIKI password',Charset:'UTF-8'},Body:{Text:{Data:`Use this link to reset your password:\n\n${url}\n\nIf you did not request this, you can ignore this message.`,Charset:'UTF-8'}}}}}))
   },
  },
  advanced:{useSecureCookies:process.env.NODE_ENV==='production', cookiePrefix:'wiki_reader'},
  rateLimit:{enabled:true,window:60,max:30,storage:'database'},
})
export {database as memberDatabase}
