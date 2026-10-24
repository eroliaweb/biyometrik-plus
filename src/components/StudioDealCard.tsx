import React from 'react';
import {
  ExternalLink,
  HardDrive,
  Layers,
  Sparkles,
  Printer,
  Tag,
} from 'lucide-react';
import { DealCategory, DealPlacement, StudioDeal } from '../types/deals';
import { openAffiliateDeal } from '../engine/dealsService';

function getCategoryMeta(category: DealCategory) {
  switch (category) {
    case 'paper':
      return {
        icon: Layers,
        label: 'Fotoğraf Kağıdı',
        bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        iconBg: 'bg-emerald-100 text-emerald-700',
      };
    case 'storage':
      return {
        icon: HardDrive,
        label: 'Stüdyo Veri Yedekleme',
        bgClass: 'bg-sky-50 text-sky-700 border-sky-200',
        iconBg: 'bg-sky-100 text-sky-700',
      };
    case 'ink':
      return {
        icon: Printer,
        label: 'Yazıcı Mürekkep & Sarf',
        bgClass: 'bg-amber-50 text-amber-800 border-amber-200',
        iconBg: 'bg-amber-100 text-amber-700',
      };
    case 'equipment':
    default:
      return {
        icon: Sparkles,
        label: 'Stüdyo Ekipman',
        bgClass: 'bg-purple-50 text-purple-700 border-purple-200',
        iconBg: 'bg-purple-100 text-purple-700',
      };
  }
}

interface StudioDealCardProps {
  deal: StudioDeal;
  placement: DealPlacement;
  storeId?: string;
  compact?: boolean;
}

export const StudioDealCard: React.FC<StudioDealCardProps> = ({
  deal,
  placement,
  storeId,
  compact = false,
}) => {
  const meta = getCategoryMeta(deal.category);
  const IconComp = meta.icon;

  const handleClick = () => {
    openAffiliateDeal(deal, placement, storeId);
  };

  if (compact) {
    return (
      <div
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
        }}
        className="group p-3 rounded-2xl bg-gradient-to-br from-emerald-50/70 via-white to-slate-50 border border-emerald-200/80 hover:border-emerald-400 shadow-sm hover:shadow transition cursor-pointer text-left"
      >
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${meta.bgClass}`}
          >
            <IconComp className="w-3 h-3" />
            <span>{deal.badge_text || meta.label}</span>
          </span>
          {deal.discount_pct > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-mono font-bold text-[10px]">
              %{deal.discount_pct} İndirim
            </span>
          )}
        </div>

        <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition line-clamp-2 leading-snug">
          {deal.title}
        </div>

        {deal.subtitle && (
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
            {deal.subtitle}
          </p>
        )}

        <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-700 truncate pr-2">
            {deal.price_text || 'Stüdyo Özel Fırsatı'}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 group-hover:translate-x-0.5 transition shrink-0">
            <span>{deal.cta_text || 'İncele'}</span>
            <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
      }}
      className="group relative flex flex-col justify-between p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-400 shadow-sm hover:shadow-md transition cursor-pointer text-left"
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${meta.iconBg}`}>
              <IconComp className="w-4 h-4" />
            </div>
            <div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${meta.bgClass}`}
              >
                <Tag className="w-2.5 h-2.5" />
                <span>{deal.badge_text || meta.label}</span>
              </span>
            </div>
          </div>

          {deal.discount_pct > 0 && (
            <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-mono font-bold text-[11px]">
              %{deal.discount_pct} Fırsat
            </span>
          )}
        </div>

        <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition leading-snug">
          {deal.title}
        </h3>

        {deal.subtitle && (
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
            {deal.subtitle}
          </p>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-slate-700 block">
            {deal.price_text || 'Amazon Stüdyo Fırsatı'}
          </span>
          <span className="text-[10px] text-slate-400">Amazon Güvencesiyle Hızlı Teslimat</span>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 group-hover:bg-emerald-600 text-emerald-700 group-hover:text-white text-xs font-semibold transition">
          <span>{deal.cta_text || 'Fırsatı Gör'}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
};
