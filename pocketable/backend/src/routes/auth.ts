import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Generate JWT tokens
const generateTokens = (userId: string) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' } // Short-lived access token
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' } // Long-lived refresh token
  );

  return { accessToken, refreshToken };
};

/**
 * POST /api/auth/register
 * Register new user with email and password
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    // Validation
    if (!email || !password || !fullName) {
      return res.status(400).json({
        error: 'Email, password, and full name are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters',
      });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'User with this email already exists',
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        fullName: fullName.trim(),
        passwordHash,
        provider: 'email',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    console.log('✅ User registered:', user.email);

    res.status(201).json({
      message: 'User created successfully',
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    // Verify password
    if (!user.passwordHash) {
      return res.status(401).json({
        error: 'Please sign in with your OAuth provider',
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    console.log('✅ User logged in:', user.email);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET!
    ) as { userId: string };

    // Check if user still exists
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

    // Generate new access token (keep same refresh token)
    const { accessToken } = generateTokens(user.id);

    res.json({
      accessToken,
      user,
    });
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    console.error('Refresh token error:', error);
    return res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      user: req.user,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal, server doesn't store tokens)
 */
router.post('/logout', authenticateToken, (req, res) => {
  console.log('✅ User logged out:', req.user?.email);
  res.json({ message: 'Logout successful' });
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: 'New password must be at least 6 characters',
      });
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      return res.status(400).json({
        error: 'Cannot change password for OAuth users',
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );

    if (!isValidPassword) {
      return res.status(400).json({
        error: 'Current password is incorrect',
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    console.log('✅ Password changed for:', user.email);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName } = req.body;
    const userId = req.user!.id;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { fullName: fullName.trim() },
      select: {
        id: true,
        email: true,
        fullName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log('✅ Profile updated for:', updatedUser.email);

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * DELETE /api/auth/account
 * Delete user account and all associated data
 */
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Delete user (CASCADE will delete all projects, files, messages, snapshots)
    await prisma.user.delete({
      where: { id: userId },
    });

    console.log('✅ Account deleted for user:', userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
