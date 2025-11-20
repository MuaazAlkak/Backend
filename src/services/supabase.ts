import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { OrderData, OrderItemData } from '../types/checkout.js';

// Lazy initialization of Supabase client
let supabaseInstance: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
    }

    // Use service role key for backend operations (bypasses RLS)
    supabaseInstance = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseInstance;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabase()[prop as keyof SupabaseClient];
  }
});

export const supabaseService = {
  /**
   * Create an order in the database
   */
  async createOrder(orderData: OrderData) {
    const { data, error } = await getSupabase()
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (error) {
      console.error('Error creating order:', error);
      throw new Error(`Failed to create order: ${error.message}`);
    }

    return data;
  },

  /**
   * Add order items to an order
   */
  async addOrderItems(orderItems: OrderItemData[]) {
    const { data, error } = await getSupabase()
      .from('order_items')
      .insert(orderItems)
      .select();

    if (error) {
      console.error('Error adding order items:', error);
      throw new Error(`Failed to add order items: ${error.message}`);
    }

    return data;
  },

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: string, stripeSessionId?: string) {
    const updateData: { status: string; stripe_session_id?: string } = { status };
    
    if (stripeSessionId) {
      updateData.stripe_session_id = stripeSessionId;
    }

    const { data, error } = await getSupabase()
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      console.error('Error updating order status:', error);
      throw new Error(`Failed to update order status: ${error.message}`);
    }

    return data;
  },

  /**
   * Get order by Stripe session ID
   */
  async getOrderBySessionId(sessionId: string) {
    const { data, error } = await getSupabase()
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          products (id, title, images)
        )
      `)
      .eq('stripe_session_id', sessionId)
      .single();

    if (error) {
      console.error('Error fetching order:', error);
      return null;
    }

    return data;
  },

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string) {
    const { data, error } = await getSupabase()
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          products (id, title, images)
        )
      `)
      .eq('id', orderId)
      .single();

    if (error) {
      console.error('Error fetching order:', error);
      return null;
    }

    return data;
  },

  /**
   * Delete user
   * This function deletes a user from auth.users, which should cascade to admin_users
   * The audit_logs.user_id will be set to NULL automatically due to ON DELETE SET NULL
   */
  async deleteUser(userId: string) {
    const supabase = getSupabase();

    try {
      // Delete from auth.users
      // This will:
      // 1. Cascade delete from admin_users (due to ON DELETE CASCADE)
      // 2. Set audit_logs.user_id to NULL (due to ON DELETE SET NULL)
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);

      if (authError) {
        console.error('Error deleting user from auth:', authError);
        throw new Error(`Failed to delete user: ${authError.message}`);
      }

      return true;
    } catch (error: any) {
      console.error('Error in deleteUser:', error);
      throw error;
    }
  },

  /**
   * Create admin user
   * Uses admin API to create user without signing in
   */
  async createUser(email: string, password: string, role: string) {
    const supabase = getSupabase();

    // Step 1: Create auth user using admin API (doesn't sign in)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for admin users
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    if (!authData.user) {
      throw new Error('User creation failed: No user returned');
    }

    // Step 2: Add user to admin_users table
    const { data, error } = await supabase
      .from('admin_users')
      .insert({
        id: authData.user.id,
        email: authData.user.email!,
        role: role,
      })
      .select()
      .single();

    if (error) {
      // If admin_users insert fails, try to clean up auth user
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
      } catch (deleteError) {
        console.error('Failed to clean up auth user after admin_users insert failure:', deleteError);
      }
      throw new Error(`Failed to add user to admin_users: ${error.message}`);
    }

    return data;
  },

  /**
   * Update user role
   */
  async updateUserRole(userId: string, role: string) {
    const { data, error } = await getSupabase()
      .from('admin_users')
      .update({ role })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user role:', error);
      throw new Error(`Failed to update user role: ${error.message}`);
    }

    return data;
  },

  /**
   * Delete product
   */
  async deleteProduct(productId: string) {
    const { data, error } = await getSupabase()
      .from('products')
      .delete()
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      console.error('Error deleting product:', error);
      throw new Error(`Failed to delete product: ${error.message}`);
    }

    return data;
  },
};

