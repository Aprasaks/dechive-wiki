'use client'

import { useState, type FormEvent } from 'react'

export default function LoginPage() {
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [status,setStatus]=useState('')
  const [busy,setBusy]=useState(false)

  async function signIn(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true);setStatus('')
    try{
      const r=await fetch('/api/staff/login',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email,password}),
      })
      if(!r.ok)throw new Error('Sign in rejected')
      setPassword('')
      window.location.replace('/studio')
    }catch{
      setStatus('Could not sign in. Check your email and password.')
    }finally{setBusy(false)}
  }
  const field={padding:12,border:'1px solid #A5A69E',background:'#fff',
    width:'100%',boxSizing:'border-box' as const,fontSize:16}
  return <div style={{maxWidth:460,margin:'4rem auto',fontFamily:'Arial, sans-serif'}}>
    <a href="/" style={{fontFamily:'Georgia, serif',fontWeight:700,
      letterSpacing:3,color:'#222',textDecoration:'none'}}>DECHIVE.WIKI</a>
    <p style={{marginTop:55,fontSize:12,letterSpacing:2,color:'#60705F'}}>STAFF ACCESS ONLY</p>
    <h1 style={{fontFamily:'Georgia, serif',fontSize:40,fontWeight:400}}>
      Editorial Sign In</h1>
    <p style={{lineHeight:1.6,color:'#4B554B'}}>
      Drafts and evidence reviews remain private until independently approved.
    </p>
    <form onSubmit={signIn} style={{display:'grid',gap:18,marginTop:32}}>
      <label>Email address
        <input aria-label="Email address" type="email" autoComplete="username" required
          value={email} onChange={e=>setEmail(e.target.value)} style={field}/>
      </label>
      <label>Password
        <input aria-label="Password" type="password" autoComplete="current-password"
          required value={password} onChange={e=>setPassword(e.target.value)} style={field}/>
      </label>
      <button disabled={busy} type="submit" style={{
        padding:14,background:'#233D34',color:'#fff',border:0,
        cursor:busy?'wait':'pointer',fontSize:15}}>
        {busy?'Signing in…':'Sign in'}
      </button>
      {status&&<p role="alert" style={{color:'#813C37'}}>{status}</p>}
    </form>
    <p style={{fontSize:12,color:'#777',marginTop:36}}>
      Accounts are provisioned privately. Public registration is disabled.
    </p>
  </div>
}
