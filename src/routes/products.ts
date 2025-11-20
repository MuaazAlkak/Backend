import express from 'express';
import { supabaseService } from '../services/supabase.js';

const router = express.Router();

/**
 * DELETE /api/products/:productId
 * Delete a product by ID
 */
router.delete('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: productId' 
      });
    }

    await supabaseService.deleteProduct(productId);

    res.json({ 
      success: true, 
      message: 'Product deleted successfully' 
    });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({ 
      error: 'Failed to delete product',
      message: error.message 
    });
  }
});

export default router;

