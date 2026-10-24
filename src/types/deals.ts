export type DealCategory = 'paper' | 'storage' | 'ink' | 'equipment';

export type DealPlacement = 'all' | 'welcome' | 'paper_tab' | 'sidebar' | 'export_modal';

export interface StudioDeal {
  id: number;
  title: string;
  subtitle: string;
  category: DealCategory;
  placement: DealPlacement;
  badge_text: string;
  discount_pct: number;
  price_text: string;
  old_price_text?: string;
  image_url?: string;
  product_url: string;
  asin?: string;
  cta_text: string;
  is_active: number;
  sort_order: number;
  views_count?: number;
  clicks_count?: number;
  affiliate_url: string;
}

export interface AffiliateSettings {
  store_id: string;
  amazon_domain: string;
  welcome_title: string;
  welcome_subtitle: string;
}

export interface DealsFeedResponse {
  success: boolean;
  storage_engine?: string;
  settings: AffiliateSettings;
  deals: StudioDeal[];
}
