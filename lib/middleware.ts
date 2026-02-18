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

/**
 * Middleware for Super Admin only
 */
export function withSuperAdmin(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return withAuth(async (req: AuthenticatedRequest) => {
    if (req.user?.role !== 'super-admin') {
      return NextResponse.json(
        { error: 'Super Admin access required' },
        { status: 403 }
      );
    }
    return handler(req);
  });
}

/**
 * Middleware for Admin and Super Admin
 */
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

/**
 * Middleware for all authenticated users (view access)
 */
export function withViewAccess(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return withAuth(async (req: AuthenticatedRequest) => {
    // Allow all authenticated users to view
    return handler(req);
  });
}

/**
 * Middleware for users with upload permission (User role can upload for their projects, Employees can upload)
 */
export function withUploadPermission(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return withAuth(async (req: AuthenticatedRequest) => {
    const role = req.user?.role;
    // Super Admin and Admin can upload anywhere
    if (role === 'super-admin' || role === 'admin') {
      return handler(req);
    }
    // Users can upload for their allotted projects only
    if (role === 'user') {
      return handler(req);
    }
    // Employees can upload
    if (role === 'employee') {
      return handler(req);
    }
    return NextResponse.json(
      { error: 'Upload permission required' },
      { status: 403 }
    );
  });
}

/**
 * Middleware for Project Head / Site login (user must have projectName in token from site login)
 */
export function withProjectHead(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return withAuth(async (req: AuthenticatedRequest) => {
    const user = req.user as (JWTPayload & { projectName?: string }) | undefined;
    if (!user?.projectName) {
      return NextResponse.json(
        { error: 'Project head / site access required' },
        { status: 403 }
      );
    }
    return handler(req);
  });
}