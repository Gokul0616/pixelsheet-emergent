import type { Express } from "express";
import { 
  AuthService, 
  authLimiter, 
  registerValidation, 
  loginValidation, 
  mfaValidation,
  checkValidationErrors,
  AuthRequest 
} from "./auth";
import { JsonFileStorage } from "./json-storage";

export function registerAuthRoutes(app: Express, storage: JsonFileStorage) {
  const authService = new AuthService(storage);

  // Register
  app.post("/api/auth/register", 
    authLimiter,
    registerValidation,
    checkValidationErrors,
    async (req, res) => {
      try {
        const { username, email, password } = req.body;
        
        const result = await authService.register({
          username,
          email,
          password,
          role: 'editor', // Default role
        });

        // Remove sensitive data from response
        const { password: _, mfaSecret, mfaBackupCodes, ...userResponse } = result.user;

        res.status(201).json({
          message: 'User registered successfully',
          user: userResponse,
          tokens: result.tokens,
        });
      } catch (error) {
        res.status(400).json({ 
          error: error instanceof Error ? error.message : 'Registration failed' 
        });
      }
    }
  );

  // Login
  app.post("/api/auth/login",
    authLimiter,
    loginValidation,
    checkValidationErrors,
    async (req, res) => {
      try {
        const { email, password, rememberMe } = req.body;
        
        const result = await authService.login(email, password, rememberMe);

        // Remove sensitive data from response
        const { password: _, mfaSecret, mfaBackupCodes, ...userResponse } = result.user;

        res.json({
          message: 'Login successful',
          user: userResponse,
          tokens: result.tokens,
          requiresMfa: result.user.mfaEnabled,
        });
      } catch (error) {
        res.status(401).json({ 
          error: error instanceof Error ? error.message : 'Login failed' 
        });
      }
    }
  );

  // MFA Login (second step)
  app.post("/api/auth/mfa/verify",
    authLimiter,
    mfaValidation,
    checkValidationErrors,
    async (req, res) => {
      try {
        const { email, mfaToken, backupCode } = req.body;
        
        const user = await storage.getUserByEmail(email);
        if (!user || !user.mfaEnabled) {
          return res.status(400).json({ error: 'MFA not enabled for this user' });
        }

        let isValid = false;

        // Check MFA token
        if (mfaToken && user.mfaSecret) {
          isValid = authService.verifyMfaToken(mfaToken, user.mfaSecret);
        }

        // Check backup code
        if (!isValid && backupCode && user.mfaBackupCodes) {
          const codeIndex = user.mfaBackupCodes.indexOf(backupCode.toUpperCase());
          if (codeIndex !== -1) {
            isValid = true;
            // Remove used backup code
            const newBackupCodes = [...user.mfaBackupCodes];
            newBackupCodes.splice(codeIndex, 1);
            await storage.updateAuthUser(user.id, { mfaBackupCodes: newBackupCodes });
          }
        }

        if (!isValid) {
          return res.status(401).json({ error: 'Invalid MFA token or backup code' });
        }

        // Generate new tokens
        const tokens = authService.generateTokens(user.id);

        // Create session
        await storage.createSession({
          userId: user.id,
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          isRememberMe: false,
        });

        // Remove sensitive data from response
        const { password: _, mfaSecret, mfaBackupCodes, ...userResponse } = user;

        res.json({
          message: 'MFA verification successful',
          user: userResponse,
          tokens,
        });
      } catch (error) {
        res.status(401).json({ 
          error: error instanceof Error ? error.message : 'MFA verification failed' 
        });
      }
    }
  );

  // Refresh token
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required' });
      }

      // Verify refresh token
      const decoded = authService.verifyToken(refreshToken, true);
      if (!decoded) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      // Check if session exists
      const session = await storage.getSessionByRefreshToken(refreshToken);
      if (!session) {
        return res.status(401).json({ error: 'Session not found' });
      }

      // Generate new tokens
      const tokens = authService.generateTokens(decoded.userId);

      res.json({ tokens });
    } catch (error) {
      res.status(401).json({ 
        error: error instanceof Error ? error.message : 'Token refresh failed' 
      });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];
      
      if (token) {
        await authService.logout(token);
      }

      res.json({ message: 'Logout successful' });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Logout failed' 
      });
    }
  });

  // Logout all sessions
  app.post("/api/auth/logout-all", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      await authService.logoutAllSessions(req.user.id);

      res.json({ message: 'All sessions logged out successfully' });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Logout failed' 
      });
    }
  });

  // Get profile
  app.get("/api/auth/profile", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { password: _, mfaSecret, mfaBackupCodes, ...userResponse } = req.user;

      res.json({ user: userResponse });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get profile' 
      });
    }
  });

  // Update profile
  app.put("/api/auth/profile", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { username, email } = req.body;
      
      if (!username && !email) {
        return res.status(400).json({ error: 'Username or email required' });
      }

      const updates: any = {};
      if (username) updates.username = username;
      if (email) updates.email = email;
      updates.updatedAt = new Date();

      await storage.updateAuthUser(req.user.id, updates);

      res.json({ message: 'Profile updated successfully' });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Profile update failed' 
      });
    }
  });

  // Change password
  app.put("/api/auth/change-password", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password required' });
      }

      // Verify current password
      const isValidPassword = await authService.verifyPassword(currentPassword, req.user.password);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const hashedPassword = await authService.hashPassword(newPassword);

      // Update password
      await storage.updateAuthUser(req.user.id, {
        password: hashedPassword,
        updatedAt: new Date(),
      });

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Password change failed' 
      });
    }
  });

  // Setup MFA
  app.post("/api/auth/mfa/setup", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const result = await authService.setupMfa(req.user.id);

      res.json({
        message: 'MFA setup initiated',
        qrCode: result.qrCodeDataUrl,
        backupCodes: result.backupCodes,
        secret: result.secret, // For manual entry
      });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'MFA setup failed' 
      });
    }
  });

  // Enable MFA
  app.post("/api/auth/mfa/enable",
    mfaValidation,
    checkValidationErrors,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { token } = req.body;
        await authService.verifyAndEnableMfa(req.user.id, token);

        res.json({ message: 'MFA enabled successfully' });
      } catch (error) {
        res.status(400).json({ 
          error: error instanceof Error ? error.message : 'MFA enablement failed' 
        });
      }
    }
  );

  // Disable MFA
  app.post("/api/auth/mfa/disable", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password required to disable MFA' });
      }

      await authService.disableMfa(req.user.id, password);

      res.json({ message: 'MFA disabled successfully' });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'MFA disable failed' 
      });
    }
  });

  // Refresh token
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required' });
      }

      const decoded = authService.verifyToken(refreshToken, true);
      if (!decoded) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      const user = await storage.getUser(decoded.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Generate new tokens
      const tokens = authService.generateTokens(user.id);

      // Update session
      const session = await storage.getSession(refreshToken);
      if (session) {
        await storage.createSession({
          userId: user.id,
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          isRememberMe: session.isRememberMe,
        });
        
        // Delete old session
        await storage.deleteSession(refreshToken);
      }

      res.json({ tokens });
    } catch (error) {
      res.status(401).json({ 
        error: error instanceof Error ? error.message : 'Token refresh failed' 
      });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req: AuthRequest, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (token) {
        await authService.logout(token);
      }

      res.json({ message: 'Logout successful' });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Logout failed' 
      });
    }
  });

  // Logout all sessions
  app.post("/api/auth/logout-all", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      await authService.logoutAllSessions(req.user.id);

      res.json({ message: 'All sessions logged out successfully' });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Logout all failed' 
      });
    }
  });

  // Get current user profile
  app.get("/api/auth/profile", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Remove sensitive data from response
      const { password, mfaSecret, mfaBackupCodes, ...userResponse } = req.user;

      res.json({
        user: userResponse,
        session: req.session ? {
          id: req.session.id,
          expiresAt: req.session.expiresAt,
          isRememberMe: req.session.isRememberMe,
        } : null,
      });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to get profile' 
      });
    }
  });

  // Update user profile
  app.put("/api/auth/profile", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { username, email } = req.body;
      const updates: any = {};

      if (username && username !== req.user.username) {
        // Check if username is available
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser && existingUser.id !== req.user.id) {
          return res.status(400).json({ error: 'Username is already taken' });
        }
        updates.username = username;
      }

      if (email && email !== req.user.email) {
        // Check if email is available
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser && existingUser.id !== req.user.id) {
          return res.status(400).json({ error: 'Email is already in use' });
        }
        updates.email = email;
        updates.emailVerified = false; // Re-verify email
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateAuthUser(req.user.id, updates);
      }

      res.json({ message: 'Profile updated successfully' });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Profile update failed' 
      });
    }
  });

  // Change password
  app.put("/api/auth/change-password", async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new passwords required' });
      }

      // Verify current password
      const isValid = await authService.verifyPassword(currentPassword, req.user.password);
      if (!isValid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const hashedPassword = await authService.hashPassword(newPassword);

      // Update password
      await storage.updateAuthUser(req.user.id, { password: hashedPassword });

      // Logout all other sessions for security
      await authService.logoutAllSessions(req.user.id);

      res.json({ message: 'Password changed successfully. Please log in again.' });
    } catch (error) {
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Password change failed' 
      });
    }
  });

  // Health check for auth system
  app.get("/api/auth/health", (req, res) => {
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  });
}