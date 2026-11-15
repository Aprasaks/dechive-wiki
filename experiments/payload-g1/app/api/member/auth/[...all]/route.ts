import {toNextJsHandler} from 'better-auth/next-js'
import {memberAuth} from '../../../../../lib/member-auth'
export const runtime='nodejs'
export const {GET,POST}=toNextJsHandler(memberAuth)
