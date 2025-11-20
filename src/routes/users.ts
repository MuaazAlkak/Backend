import express from 'express';
import { supabaseService } from '../services/supabase.js';

const router = express.Router();

/**
 * POST /api/users
 * Create a new admin user
 */
router.post('/', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ 
        error: 'Missing required fields: email, password, role' 
      });
    }

    // Validate role
    const validRoles = ['super_admin', 'admin', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
      });
    }

    const user = await supabaseService.createUser(email, password, role);

    res.json({ 
      success: true, 
      message: 'User created successfully',
      user 
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      error: 'Failed to create user',
      message: error.message 
    });
  }
});

/**
 * DELETE /api/users/:userId
 * Delete a user by ID
 */
router.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    await supabaseService.deleteUser(userId);

    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      error: 'Failed to delete user',
      message: error.message 
    });
  }
});

/**
 * PUT /api/users/:userId/role
 * Update a user's role
 */
router.put('/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    if (!role) {
      return res.status(400).json({ 
        error: 'Missing required field: role' 
      });
    }

    // Validate role
    const validRoles = ['super_admin', 'admin', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
      });
    }

    const updatedUser = await supabaseService.updateUserRole(userId, role);

    res.json({ 
      success: true, 
      message: 'User role updated successfully',
      user: updatedUser
    });
  } catch (error: any) {
    console.error('Error updating user role:', error);
    res.status(500).json({ 
      error: 'Failed to update user role',
      message: error.message 
    });
  }
});

export default router;

