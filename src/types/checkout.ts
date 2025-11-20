export interface ShippingInfo {
  fullName: string;
  email: string;
  phone?: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface CartItem {
  product: {
    id: string;
    title: {
      en: string;
      ar?: string;
      sv?: string;
    };
    price: number;
    currency: string;
    images: string[];
    discount_percentage?: number;
  };
  quantity: number;
  activeEvent?: {
    id?: string;
    discount_percentage?: number;
  };
}

export interface CreateCheckoutSessionRequest {
  items: CartItem[];
  shippingInfo: ShippingInfo;
  currency: string;
  discountCode?: string;
  discountAmount?: number;
  subtotal: number;
  shipping: number;
  total: number;
}

export interface OrderData {
  user_id?: string;
  total_amount: number;
  currency: string;
  shipping: ShippingInfo;
  status: string;
  discount_code?: string | null;
  discount_amount?: number;
  stripe_session_id?: string;
  payment_method?: string;
}

export interface OrderItemData {
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
}

