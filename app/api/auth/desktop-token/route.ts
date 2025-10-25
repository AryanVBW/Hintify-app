import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * API endpoint to get Clerk session token for desktop app authentication
 * This endpoint is called by the OpenInAppPopup component to get the token
 * that will be passed to the Electron app via deep link
 */
export async function GET() {
  try {
    // Get the current user from Clerk
    const user = await currentUser()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Get the session token
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) {
      return NextResponse.json(
        { error: 'Failed to get session token' },
        { status: 500 }
      )
    }

    // Prepare user data for the desktop app
    const userData = {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      name: user.fullName || user.firstName || user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      username: user.username,
      imageUrl: user.imageUrl,
      provider: 'clerk',
      emailVerified: user.emailAddresses[0]?.verification?.status === 'verified',
    }

    return NextResponse.json({
      token,
      user: userData,
    })
  } catch (error) {
    console.error('Error getting desktop token:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

