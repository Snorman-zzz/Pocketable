import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { databaseService } from '../services/database';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        fullName: string;
      };
    }
  }
}

/**
 * Middleware to verify JWT token and attach user to request
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Middleware to verify user owns the project
 * Must be used after authenticateToken
 */
export const verifyProjectOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required' });
    }

    // Check project ownership
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const result = await databaseService.query(
      `SELECT user_id FROM projects WHERE id = $1`,
      [projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (result.rows[0].user_id !== userId) {
      return res.status(403).json({
        error: 'Access denied: You do not own this project'
      });
    }

    next();
  } catch (error) {
    console.error('Error verifying project ownership:', error);
    return res.status(500).json({ error: 'Failed to verify ownership' });
  }
};

/**
 * Middleware to verify user owns a snapshot (via project)
 * Must be used after authenticateToken
 */
export const verifySnapshotOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { snapshotId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!snapshotId) {
      return res.status(400).json({ error: 'Snapshot ID required' });
    }

    // Get snapshot and check project ownership
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const result = await databaseService.query(
      `SELECT p.user_id
       FROM code_snapshots cs
       JOIN projects p ON cs.project_id = p.id
       WHERE cs.id = $1`,
      [snapshotId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    if (result.rows[0].user_id !== userId) {
      return res.status(403).json({
        error: 'Access denied: You do not own this snapshot'
      });
    }

    next();
  } catch (error) {
    console.error('Error verifying snapshot ownership:', error);
    return res.status(500).json({ error: 'Failed to verify ownership' });
  }
};
