import { AffiliateSettings, DealPlacement, DealsFeedResponse, StudioDeal } from '../types/deals';

export const DEFAULT_STORE_ID = 'machineerrors-20';

export const REMOTE_BACKEND_BASE = 'https://erolia.com.tr/biyometrik-backend-api';

const API_ENDPOINTS = [
  `${REMOTE_BACKEND_BASE}/api/deals.php`,
  'http://127.0.0.1:8787/backend/api/deals.php',
  'http://localhost/photoid/backend/api/deals.php',
];

const TRACK_ENDPOINTS = [
  `${REMOTE_BACKEND_BASE}/api/track.php`,
  'http://127.0.0.1:8787/backend/api/track.php',
  'http://localhost/photoid/backend/api/track.php',
];

export const ADMIN_PANEL_URLS = [
  `${REMOTE_BACKEND_BASE}/admin/index.php`,
  'http://127.0.0.1:8787/backend/admin/index.php',
  'http://localhost/photoid/backend/admin/index.php',
];

const CACHE_KEY = 'bp_studio_deals_cache_v1';

export function buildClientAffiliateUrl(
  rawUrl: string,
  storeId: string = DEFAULT_STORE_ID
): string {
  const tag = storeId.trim() || DEFAULT_STORE_ID;
  try {
    const u = new URL(rawUrl);
    u.searchParams.set('tag', tag);
    if (!u.searchParams.has('linkCode')) {
      u.searchParams.set('linkCode', 'll1');
    }
    return u.toString();
  } catch {
    const sep = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${sep}tag=${encodeURIComponent(tag)}&linkCode=ll1`;
  }
}

export const FALLBACK_DEALS_DATA: DealsFeedResponse = {
  success: true,
  settings: {
    store_id: DEFAULT_STORE_ID,
    amazon_domain: 'www.amazon.com.tr',
    welcome_title: 'Bu Ayın İndirimli Fotoğraf Kağıtları & Stüdyo Veri Yedekleme Fırsatları',
    welcome_subtitle:
      'Fotoğraf stüdyoları için seçilmiş 10×15 ve A4 fotoğraf kağıtları, yüksek hızlı taşınabilir SSD arşiv diskleri ve ekipman indirimleri.',
  },
  deals: [
    {
      id: 1,
      title: "Kodak & Epson 10×15 cm (260g) Parlak Fotoğraf Kağıdı — 100'lü Stüdyo Paketi",
      subtitle:
        'Biyometrik ve vesikalık baskılar için suya dayanıklı, anında kuruyan yüksek gramajlı RC parlak fotoğraf kağıdı.',
      category: 'paper',
      placement: 'all',
      badge_text: 'Bu Ayın Kağıt İndirimi',
      discount_pct: 22,
      price_text: 'Avantajlı Stüdyo Paketi',
      old_price_text: '%22 İndirimli',
      product_url: 'https://www.amazon.com.tr/s?k=10x15+fotograf+kagidi+parlak',
      cta_text: 'İndirimli Kağıtları İncele',
      is_active: 1,
      sort_order: 1,
      affiliate_url: buildClientAffiliateUrl(
        'https://www.amazon.com.tr/s?k=10x15+fotograf+kagidi+parlak',
        DEFAULT_STORE_ID
      ),
    },
    {
      id: 2,
      title: 'Samsung T7 / SanDisk Extreme 1TB & 2TB Taşınabilir SSD — Stüdyo Veri Yedekleme',
      subtitle:
        'Müşteri arşivlerinizi ve yüksek çözünürlüklü RAW/JPEG fotoğraflarınızı 1050 MB/sn hızla güvenle yedekleyin.',
      category: 'storage',
      placement: 'all',
      badge_text: 'Stüdyo Veri Yedekleme İndirimi',
      discount_pct: 19,
      price_text: '1 TB / 2 TB Seçenekleri',
      old_price_text: '%19 Fırsat',
      product_url: 'https://www.amazon.com.tr/s?k=tasinabilir+ssd+1tb+2tb+samsung+sandisk',
      cta_text: 'SSD İndirimlerini Gör',
      is_active: 1,
      sort_order: 2,
      affiliate_url: buildClientAffiliateUrl(
        'https://www.amazon.com.tr/s?k=tasinabilir+ssd+1tb+2tb+samsung+sandisk',
        DEFAULT_STORE_ID
      ),
    },
    {
      id: 3,
      title: 'Epson EcoTank & Canon PIXMA Orijinal Fotoğraf Mürekkep Setleri (6 Renk / 4 Renk)',
      subtitle:
        'Solmayan canlı cilt tonları ve tam siyah-beyaz dengesi için orijinal stüdyo yazıcı mürekkeplerinde aylık fırsat.',
      category: 'ink',
      placement: 'paper_tab',
      badge_text: 'Sarf Malzeme Fırsatı',
      discount_pct: 16,
      price_text: 'Çoklu Set Avantajı',
      old_price_text: '%16 İndirim',
      product_url: 'https://www.amazon.com.tr/s?k=epson+canon+orijinal+fotograf+yazici+murekkebi',
      cta_text: 'Mürekkep Fırsatlarına Bak',
      is_active: 1,
      sort_order: 3,
      affiliate_url: buildClientAffiliateUrl(
        'https://www.amazon.com.tr/s?k=epson+canon+orijinal+fotograf+yazici+murekkebi',
        DEFAULT_STORE_ID
      ),
    },
    {
      id: 4,
      title: 'Godox & Bi-Color LED Stüdyo Softbox Işık Seti + SanDisk Extreme PRO SDXC Kartlar',
      subtitle:
        'Biyometrik çekimlerde gölgesiz beyaz fon aydınlatması sağlayan ikili softbox ve 200 MB/sn SD hafıza kartları.',
      category: 'equipment',
      placement: 'welcome',
      badge_text: 'Stüdyo Ekipman Fırsatı',
      discount_pct: 15,
      price_text: 'Profesyonel Stüdyo Serisi',
      old_price_text: '%15 İndirim',
      product_url: 'https://www.amazon.com.tr/s?k=studyo+softbox+isik+seti+godox',
      cta_text: 'Ekipmanları İncele',
      is_active: 1,
      sort_order: 4,
      affiliate_url: buildClientAffiliateUrl(
        'https://www.amazon.com.tr/s?k=studyo+softbox+isik+seti+godox',
        DEFAULT_STORE_ID
      ),
    },
  ],
};

export async function fetchStudioDeals(): Promise<DealsFeedResponse> {
  for (const endpoint of API_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const json: DealsFeedResponse = await res.json();
        if (json && json.success && Array.isArray(json.deals)) {
          const storeId = json.settings?.store_id || DEFAULT_STORE_ID;
          json.deals = json.deals.map((d) => ({
            ...d,
            affiliate_url: buildClientAffiliateUrl(d.affiliate_url || d.product_url, storeId),
          }));
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(json));
          } catch {}
          return json;
        }
      }
    } catch {
      // Try next endpoint
    }
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: DealsFeedResponse = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.deals) && parsed.deals.length > 0) {
        return parsed;
      }
    }
  } catch {}

  return FALLBACK_DEALS_DATA;
}

export function filterDealsForPlacement(
  deals: StudioDeal[],
  placement: DealPlacement
): StudioDeal[] {
  const matched = deals.filter(
    (d) =>
      Number(d.is_active) !== 0 &&
      (d.placement === 'all' ||
        d.placement === placement ||
        (placement === 'welcome' && (d.placement === 'paper_tab' || d.placement === 'sidebar')))
  );

  if (placement === 'sidebar') {
    return [...matched].sort((a, b) => {
      const aScore = a.placement === 'sidebar' ? 3 : a.category === 'storage' ? 2 : 1;
      const bScore = b.placement === 'sidebar' ? 3 : b.category === 'storage' ? 2 : 1;
      return bScore - aScore;
    });
  }

  if (placement === 'paper_tab') {
    return [...matched].sort((a, b) => {
      const aScore = a.category === 'paper' || a.category === 'ink' ? 2 : 1;
      const bScore = b.category === 'paper' || b.category === 'ink' ? 2 : 1;
      return bScore - aScore;
    });
  }

  return matched;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (window.biyometrikElectron?.openExternal) {
    await window.biyometrikElectron.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function openAffiliateDeal(
  deal: StudioDeal,
  placement: DealPlacement,
  storeId: string = DEFAULT_STORE_ID
): Promise<void> {
  const targetUrl = buildClientAffiliateUrl(
    deal.affiliate_url || deal.product_url,
    storeId || DEFAULT_STORE_ID
  );

  // Arka planda tıklama istatistiğini PHP+MySQL API'ye gönder
  for (const trackUrl of TRACK_ENDPOINTS) {
    fetch(trackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deal_id: deal.id,
        event: 'click',
        placement,
      }),
    }).catch(() => {});
  }

  await openExternalUrl(targetUrl);
}

const REMOTE_HEARTBEAT_URL = `${REMOTE_BACKEND_BASE}/api/heartbeat.php`;

const LOCAL_HEARTBEAT_ENDPOINTS = [
  'http://localhost/photoid/backend/api/heartbeat.php',
  'http://127.0.0.1:8787/backend/api/heartbeat.php',
];

const CLIENT_ID_KEY = 'bp_studio_client_uuid_v1';
const SESSION_ID_KEY = 'bp_studio_session_uuid_v1';

export function getOrCreateClientId(): string {
  try {
    let cid = localStorage.getItem(CLIENT_ID_KEY);
    if (!cid) {
      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      const ts = Date.now().toString(36).slice(-4).toUpperCase();
      cid = `BP-${ts}${rand}`;
      localStorage.setItem(CLIENT_ID_KEY, cid);
    }
    return cid;
  } catch {
    return 'BP-LOCAL01';
  }
}

export function getOrCreateSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = `SESS-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
      sessionStorage.setItem(SESSION_ID_KEY, sid);
    }
    return sid;
  } catch {
    return 'SESS-DEFAULT';
  }
}

export interface HeartbeatOptions {
  activeScreen: 'welcome' | 'studio_single' | 'studio_sheet' | 'paper_tab' | 'export_modal';
  photosCount: number;
  studioLabel?: string;
  status?: 'online' | 'offline';
}

export async function sendClientHeartbeat(opts: HeartbeatOptions): Promise<void> {
  const clientId = getOrCreateClientId();
  const sessionId = getOrCreateSessionId();
  const isElectron = Boolean(
    typeof window !== 'undefined' &&
      (window.biyometrikElectron?.isDesktop || navigator.userAgent.includes('Electron'))
  );

  const payload = JSON.stringify({
    client_id: clientId,
    session_id: sessionId,
    studio_label: opts.studioLabel || `Stüdyo #${clientId.slice(-6)}`,
    platform: isElectron ? 'Windows Masaüstü (Electron)' : 'Web Tarayıcı',
    app_version: '2.4.0',
    active_screen: opts.activeScreen,
    photos_count: opts.photosCount,
    status: opts.status || 'online',
  });

  // 1. Öncelikle canlı sunucuya (erolia.com.tr) sinyal gönder
  fetch(REMOTE_HEARTBEAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: opts.status === 'offline',
  }).catch(() => {});

  // 2. Yerel geliştirme ortamı açıksa ilk erişilebilir yerel sunucuya da senkronize et
  for (const url of LOCAL_HEARTBEAT_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: opts.status === 'offline',
      });
      if (res.ok) {
        break;
      }
    } catch {
      // Try next local endpoint
    }
  }
}

