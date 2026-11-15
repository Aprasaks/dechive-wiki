'use client'
import {useEffect,useState,type FormEvent} from 'react'
import {memberClient} from '../../../lib/member-auth-client'
export default function ResetPasswordPage(){
 const [token,setToken]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>setToken(new URLSearchParams(window.location.search).get('token')||''),[])
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');try{
  if(token){const r=await memberClient.resetPassword({newPassword:password,token});setMessage(r.error?'The link is invalid or expired. Request a new link.':'Password changed. You can sign in now.')}
  else{await memberClient.requestPasswordReset({email,redirectTo:window.location.origin+'/member/reset'});setMessage('If an account exists for that address, a reset link will be sent.')}
 }catch{setMessage('Unable to complete the request. Please try again.')}finally{setBusy(false)}}
 return <main className="member-area"><h1>{token?'Choose a new password':'Reset your password'}</h1><form onSubmit={submit}>{token?<label>New password<input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>:<label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>}<button disabled={busy}>{busy?'Please wait…':token?'Change password':'Send reset link'}</button></form>{message&&<p role="status">{message}</p>}<p><a href="/member">Back to sign in</a></p></main>
}
