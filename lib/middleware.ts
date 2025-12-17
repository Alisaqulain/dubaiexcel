import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractTokenFromHeader, JWTPayload } from './jwt';

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

export function withAuth(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const authHeader = req.headers.get('authorization');
      const token = extractTokenFromHeader(authHeader);

      if (!token) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      const user = verifyToken(token);
      (req as AuthenticatedRequest).user = user;

      return handler(req as AuthenticatedRequest);
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Authentication failed' },
        { status: 401 }
      );
    }
  };
}

export function withAdmin(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return withAuth(async (req: AuthenticatedRequest) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super-admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    return handler(req);
  });
}

export function withSuperAdmin(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return withAuth(async (req: AuthenticatedRequest) => {
    if (req.user?.role !== 'super-admin') {
      return NextResponse.json(
        { error: 'Super admin access required' },
        { status: 403 }
      );
    }
    return handler(req);
  });
}

export function withViewAccess(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return withAuth(async (req: AuthenticatedRequest) => {
    // All authenticated users can view
    return handler(req);
  });
}

