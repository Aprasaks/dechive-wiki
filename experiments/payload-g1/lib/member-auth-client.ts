'use client'
import {createAuthClient} from 'better-auth/react'
export const memberClient=createAuthClient({basePath:'/api/member/auth'})
