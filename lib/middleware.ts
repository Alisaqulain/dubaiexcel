import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractTokenFromHeader, JWTPayload } from './jwt';
import connectDB from './mongodb';
import User from '@/models/User';

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload & { isActive?: boolean; canUpload?: boolean };
}

export function withAuth(
  handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      const authHeader = req.headers.get('authorization');
      const token = extractTokenFromHeader(authHeader);

      if (!token) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      const userPayload = verifyToken(token);
      
      // Verify user exists and is active
      await connectDB();
      const user = await User.findById(userPayload.userId).lean();
      
      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 401 }
        );
      }

      if (!user.isActive) {
        return NextResponse.json(
          { error: 'Account is inactive' },
          { status: 403 }
        );
      }

      (req as AuthenticatedRequest).user = {
        ...userPayload,
        isActive: user.isActive,
        canUpload: user.canUpload,
      };

      return handler(req as AuthenticatedRequest, context);
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Authentication failed' },
        { status: 401 }
      );
    }
  };
}

export function withAdmin(
  handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>
) {
  return withAuth(async (req: AuthenticatedRequest, context?: any) => {
    if (req.user?.role !== 'admin') {
      return NextResponse.json(
        { 
          error: 'Access Denied',
          message: 'This feature is only available to administrators. Please contact your administrator if you need access.',
          code: 'ADMIN_REQUIRED'
        },
        { status: 403 }
      );
    }
    return handler(req, context);
  });
}

export function withUploadPermission(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return withAuth(async (req: AuthenticatedRequest) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'e1-user') {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    if (req.user?.role === 'e1-user' && !req.user?.canUpload) {
      return NextResponse.json(
        { 
          error: 'Upload Access Disabled',
          message: 'Upload functionality is currently disabled for your account. Please contact your administrator to enable upload access.',
          code: 'UPLOAD_DISABLED'
        },
        { status: 403 }
      );
    }

    return handler(req);
  });
}

