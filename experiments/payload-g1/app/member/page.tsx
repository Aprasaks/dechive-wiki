'use client'
import {useState,type FormEvent} from 'react'
import {memberClient} from '../../lib/member-auth-client'

export default function MemberPage(){
 const {data:session,isPending}=memberClient.useSession()
 const [signup,setSignup]=useState(false),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function submit(e:FormEvent){
  e.preventDefault();setError('');setBusy(true)
  try{
   const result=signup?await memberClient.signUp.email({name,email,password}):await memberClient.signIn.email({email,password})
   if(result.error){setError(result.error.message||'Could not sign in.');return}
   window.location.assign('/bookmarks')
  }catch{setError('Unable to connect. Please try again.') }finally{setBusy(false)}
 }
 if(isPending)return <main className="member-area"><p>Loading account…</p></main>
 if(session)return <main className="member-area"><h1>Your account</h1><p>{session.user.email}</p><a href="/bookmarks">View saved articles</a><p><button onClick={async()=>{await memberClient.signOut();window.location.assign('/')}}>Sign out</button></p></main>
 return <main className="member-area"><h1>{signup?'Create your account':'Sign in'}</h1><p>Save articles and return to your archive on any device.</p>
 <form onSubmit={submit}>{signup&&<label>Name<input value={name} onChange={e=>setName(e.target.value)} required autoComplete="name"/></label>}
 <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label>
 <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={12} autoComplete={signup?'new-password':'current-password'}/></label>
 {signup&&<small>Use at least 12 characters.</small>}{error&&<p role="alert">{error}</p>}
 <button disabled={busy}>{busy?'Please wait…':signup?'Create account':'Sign in'}</button></form>
 {!signup&&<p><a href="/member/reset">Forgot your password?</a></p>}
 <button type="button" onClick={()=>{setSignup(!signup);setError('')}}>{signup?'Already have an account? Sign in':'New here? Create an account'}</button></main>
}
