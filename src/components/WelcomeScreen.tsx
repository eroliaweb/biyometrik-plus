import React, { useState } from 'react';
import {
  Camera,
  Upload,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Layers,
  HardDrive,
  Printer,
} from 'lucide-react';
import { AffiliateSettings, DealCategory, StudioDeal } from '../types/deals';
import { StudioDealCard } from './StudioDealCard';

interface WelcomeScreenProps {
  settings: AffiliateSettings;
  deals: StudioDeal[];
  onStartStudio: () => void;
  onSelectFiles: () => void;
  onFilesDropped: (files: FileList) => void;
  onRefreshDeals?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  settings,
  deals,
  onStartStudio,
  onSelectFiles,
  onFilesDropped,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | DealCategory>('all');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const visibleDeals =
    selectedCategory === 'all'
      ? deals
      : deals.filter((d) => d.category === selectedCategory);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onFilesDropped(e.dataTransfer.files);
        }
      }}
      className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col overflow-y-auto"
    >
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shadow-sm">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-slate-900">
                BiyometrikPlus
              </span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                Stüdyo Pro · Tam Sürüm
              </span>
            </div>
            <p className="text-xs text-slate-500">
              AI Biyometrik & Vesikalık Hizalama, Arka Plan Silme ve Çoklu Baskı Stüdyosu
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onStartStudio}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
          >
            <span>Stüdyoyu Başlat</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col justify-between gap-8">
        {/* Hero / Launcher Card */}
        <div
          className={`relative rounded-3xl bg-white border-2 transition p-8 shadow-sm ${
            isDraggingOver
              ? 'border-emerald-500 bg-emerald-50/40'
              : 'border-slate-200'
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>AI Yüz & Omuz Hizalama Motoru Hazır</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Biyometrik, Vesikalık ve Askeri Kimlik Fotoğraflarını Saniyeler İçinde Hazırlayın
              </h1>

              <p className="text-sm text-slate-600 leading-relaxed">
                Fotoğrafınızı seçin veya sürükleyip bırakın; yapay zeka yüz hatlarını otomatik algılar,
                arka planı temizler, stüdyo rötuşunu uygular ve 10×15 cm kağıda çoklu baskı dizilimini hazırlar.
              </p>

              {/* Supported Standards Badges */}
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  '50×60 mm Biyometrik / Kimlik / Pasaport',
                  '45×60 mm Standart Vesikalık',
                  '25×32 mm Askeri Kimlik',
                  '35×45 mm Schengen Vize',
                ].map((std) => (
                  <span
                    key={std}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{std}</span>
                  </span>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={onSelectFiles}
                  className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md hover:shadow-lg transition"
                >
                  <Upload className="w-4 h-4" />
                  <span>Fotoğraf Seç ve Hemen Başla</span>
                </button>

                <button
                  onClick={onStartStudio}
                  className="flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm transition"
                >
                  <span>Stüdyo Çalışma Ekranını Aç</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right Dropzone Box */}
            <div className="lg:col-span-5">
              <div
                onClick={onSelectFiles}
                className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/80 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[220px]"
              >
                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-emerald-200 flex items-center justify-center mb-3">
                  <Upload className="w-7 h-7 text-emerald-600" />
                </div>
                <div className="text-sm font-bold text-slate-900">
                  Fotoğrafları Buraya Sürükleyin veya Tıklayın
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  JPG, PNG, WEBP · Çoklu fotoğraf seçimi desteklenir
                </p>
                <span className="mt-4 px-3 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-semibold text-emerald-700">
                  Bilgisayardan Dosya Seç
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Native Studio Deals & Supplies Section (Amazon Affiliate) */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {settings.welcome_title ||
                    'Bu Ayın İndirimli Fotoğraf Kağıtları & Stüdyo Veri Yedekleme Fırsatları'}
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                {settings.welcome_subtitle ||
                  'Stüdyonuz için seçilmiş indirimli 10×15 fotoğraf kağıtları, taşınabilir SSD yedekleme diskleri ve sarf malzemeleri.'}
              </p>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { key: 'all', label: 'Tüm Fırsatlar', icon: Sparkles },
                { key: 'paper', label: 'Fotoğraf Kağıdı', icon: Layers },
                { key: 'storage', label: 'Veri Yedekleme (SSD)', icon: HardDrive },
                { key: 'ink', label: 'Mürekkep & Sarf', icon: Printer },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = selectedCategory === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setSelectedCategory(tab.key as 'all' | DealCategory)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {visibleDeals.map((deal) => (
              <StudioDealCard
                key={deal.id}
                deal={deal}
                placement="welcome"
                storeId={settings.store_id}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};
