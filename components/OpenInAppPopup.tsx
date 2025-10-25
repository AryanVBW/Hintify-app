'use client'

import React, { useEffect, useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth/AuthProvider'
import { useUser } from '@clerk/nextjs'

interface OpenInAppPopupProps {
  onClose?: () => void
}

export const OpenInAppPopup: React.FC<OpenInAppPopupProps> = ({ onClose }) => {
  const { user: supabaseUser, session } = useAuth()
  const { user: clerkUser } = useUser()
  const [isVisible, setIsVisible] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  // Use Clerk user if available, otherwise fall back to Supabase
  const user = clerkUser || supabaseUser

  useEffect(() => {
    // Check if user came from app and is authenticated
    const urlParams = new URLSearchParams(window.location.search)
    const fromApp = urlParams.get('source') === 'app'
    const authenticated = urlParams.get('authenticated') === 'true'

    if (fromApp && (authenticated || user)) {
      // Show popup after a short delay for better UX
      setTimeout(() => {
        setIsVisible(true)
      }, 500)
    }
  }, [user])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsVisible(false)
      setIsClosing(false)
      onClose?.()
      
      // Clean up URL parameters
      const url = new URL(window.location.href)
      url.searchParams.delete('source')
      url.searchParams.delete('authenticated')
      window.history.replaceState({}, '', url.toString())
    }, 300)
  }

  const handleOpenInApp = async () => {
    if (!user) {
      console.error('No user available')
      return
    }

    try {
      // Prepare user data based on which auth provider is being used
      let userData: any
      let token: string | null = null
      let refreshToken: string | null = null

      if (clerkUser) {
        // Using Clerk authentication
        console.log('🔐 Using Clerk authentication')

        // Get Clerk session token
        try {
          const response = await fetch('/api/auth/desktop-token')
          const data = await response.json()

          if (data.token && data.user) {
            token = data.token
            userData = data.user
          } else {
            throw new Error('Failed to get Clerk token')
          }
        } catch (error) {
          console.error('Error getting Clerk token:', error)
          return
        }
      } else if (supabaseUser && session) {
        // Using Supabase authentication
        console.log('🔐 Using Supabase authentication')

        userData = {
          id: supabaseUser.id,
          email: supabaseUser.email,
          name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email,
          image_url: supabaseUser.user_metadata?.avatar_url || supabaseUser.user_metadata?.picture,
          provider: 'supabase',
          email_verified: supabaseUser.email_confirmed_at ? true : false,
        }

        token = session.access_token
        refreshToken = session.refresh_token
      } else {
        console.error('No authentication provider available')
        return
      }

      // Create deep link URL with authentication tokens and user data
      const deepLinkUrl = clerkUser
        ? `hintify://auth/callback?token=${encodeURIComponent(token!)}&user=${encodeURIComponent(JSON.stringify(userData))}`
        : `hintify://auth?token=${encodeURIComponent(token!)}&refresh_token=${encodeURIComponent(refreshToken || '')}&user=${encodeURIComponent(JSON.stringify(userData))}`

      console.log('🔗 Opening deep link to app:', {
        provider: clerkUser ? 'clerk' : 'supabase',
        hasToken: !!token,
        hasRefreshToken: !!refreshToken,
        hasUserData: !!userData?.id,
        userEmail: userData?.email
      })

      // Attempt to open the deep link
      window.location.href = deepLinkUrl

      // Show success message
      setTimeout(() => {
        handleClose()
      }, 2000)
    } catch (error) {
      console.error('Error opening app:', error)
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div 
        className={`relative w-full max-w-md bg-gradient-to-br from-gray-900 via-black to-gray-900 border-2 border-white/20 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 animate-pulse" />
        
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="relative p-8 space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-lg shadow-yellow-500/50">
              <ExternalLink className="w-8 h-8 text-black" />
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">
              Open in Hintify App
            </h2>
            <p className="text-gray-300">
              You've successfully signed in! Continue your experience in the Hintify desktop app.
            </p>
          </div>

          {/* User info */}
          {user && (
            <div className="flex items-center gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
              {(() => {
                // Get user avatar and name based on auth provider
                const avatar = clerkUser?.imageUrl || supabaseUser?.user_metadata?.avatar_url || supabaseUser?.user_metadata?.picture
                const name = clerkUser?.fullName || supabaseUser?.user_metadata?.full_name || supabaseUser?.user_metadata?.name
                const email = clerkUser?.primaryEmailAddress?.emailAddress || supabaseUser?.email
                const initial = (name || email || 'U')[0].toUpperCase()

                return (
                  <>
                    {avatar ? (
                      <img
                        src={avatar}
                        alt={name || email || 'User'}
                        className="w-10 h-10 rounded-full border-2 border-white/20"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                        {initial}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {name || email}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {email}
                      </p>
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          {/* Buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleOpenInApp}
              className="w-full bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-black font-semibold py-6 rounded-lg shadow-lg shadow-yellow-500/30 transition-all duration-200 hover:shadow-yellow-500/50"
            >
              Open in App
            </Button>
            <Button
              onClick={handleClose}
              variant="ghost"
              className="w-full text-gray-400 hover:text-white hover:bg-white/5"
            >
              Continue on Web
            </Button>
          </div>

          {/* Helper text */}
          <p className="text-xs text-center text-gray-500">
            If the app doesn't open automatically, make sure Hintify is installed on your computer.
          </p>
        </div>
      </div>
    </div>
  )
}

export default OpenInAppPopup

