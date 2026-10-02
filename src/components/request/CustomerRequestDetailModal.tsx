import React, { useEffect } from 'react';
import {
  X,
  Sparkles,
  Calendar,
  Phone,
  Layers,
  FileText,
  LinkSquare,
  Link as LinkIcon,
} from 'reicon-react';
import { getStatusBadgeInfo } from '../../lib/jewellery-request-status';

export interface CustomerJewelleryRequest {
  id: string;
  requestNumber: string;
  jewelleryType: string;
  description: string;
  budget: number | null;
  quantity: number;
  phone: string;
  additionalRequirements: string | null;
  inspirationImageUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface CustomerRequestDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: CustomerJewelleryRequest | null;
}

export const CustomerRequestDetailModal: React.FC<CustomerRequestDetailModalProps> = ({
  isOpen,
  onClose,
  request,
}) => {
  // Lock body scroll when modal is open and restore on close
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !request) return null;

  const statusInfo = getStatusBadgeInfo(request.status);
  const StatusIcon = statusInfo.icon;
  const isHttpUrl =
    request.inspirationImageUrl &&
    (request.inspirationImageUrl.startsWith('http://') ||
      request.inspirationImageUrl.startsWith('https://') ||
      request.inspirationImageUrl.startsWith('data:image'));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      data-lenis-prevent
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-2xl bg-[#FFFDF8] border border-[#E8C98A]/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] overscroll-contain"
        data-lenis-prevent
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[#E8C98A]/30 bg-gradient-to-r from-[#28040B] to-[#3B0711] text-[#F8F1E3] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E8C98A]/15 border border-[#E8C98A]/30 flex items-center justify-center text-[#E8C98A] shrink-0">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base sm:text-lg font-bold text-[#FFE3C7]">
                  Request Details
                </h3>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white/10 text-white/90 border border-white/10">
                  {request.requestNumber}
                </span>
              </div>
              <p className="text-[11px] text-[#F8F1E3]/70 flex items-center gap-1.5 mt-0.5">
                <Calendar size={12} />
                <span>
                  Submitted on{' '}
                  {new Date(request.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-[#F8F1E3] transition cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          className="p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 overscroll-contain space-y-6 text-[#211A17] no-scrollbar scrollbar-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          data-lenis-prevent
        >
          {/* Status & Key Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white border border-[#E8C98A]/30 shadow-xs space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">
                Status
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusInfo.bgClass}`}
              >
                <StatusIcon size={12} />
                <span>{statusInfo.label}</span>
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-[#E8C98A]/30 shadow-xs space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">
                Category
              </span>
              <p className="text-xs sm:text-sm font-serif font-bold text-[#28040B]">
                {request.jewelleryType}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white border border-[#E8C98A]/30 shadow-xs space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">
                Quantity
              </span>
              <p className="text-xs sm:text-sm font-semibold text-[#211A17]">
                {request.quantity} {request.quantity > 1 ? 'Units' : 'Unit'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white border border-[#E8C98A]/30 shadow-xs space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">
                Budget
              </span>
              <p className="text-xs sm:text-sm font-semibold text-[#8C6C38]">
                {request.budget !== null
                  ? `₹${request.budget.toLocaleString('en-IN')}`
                  : 'Flexible'}
              </p>
            </div>
          </div>

          {/* Customer Description */}
          <div className="p-4 rounded-xl bg-white border border-[#E8C98A]/30 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8C6C38]">
              <FileText size={14} />
              <span>Design Description</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {request.description}
            </p>
          </div>

          {/* Additional Requirements if present */}
          {request.additionalRequirements && (
            <div className="p-4 rounded-xl bg-white border border-[#E8C98A]/30 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8C6C38]">
                <Layers size={14} />
                <span>Additional Preferences & Requirements</span>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                {request.additionalRequirements}
              </p>
            </div>
          )}

          {/* Inspiration Reference */}
          {request.inspirationImageUrl && (
            <div className="p-4 rounded-xl bg-white border border-[#E8C98A]/30 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8C6C38] flex items-center gap-1.5">
                  <Sparkles size={14} />
                  <span>Inspiration Reference</span>
                </span>
                {isHttpUrl && (
                  <a
                    href={request.inspirationImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#8C6C38] hover:text-[#40000D] font-semibold flex items-center gap-1 transition"
                  >
                    <span>Open Link</span>
                    <LinkSquare size={12} />
                  </a>
                )}
              </div>

              {/* Image Preview or Link Box */}
              <div className="rounded-xl border border-[#E8C98A]/30 bg-[#FAF6F0] overflow-hidden p-3 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-full sm:w-44 h-44 rounded-lg bg-white border border-[#E8C98A]/20 overflow-hidden shrink-0 flex items-center justify-center shadow-xs">
                  <img
                    src={request.inspirationImageUrl}
                    alt="Inspiration Preview"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://placehold.co/300x300?text=Inspiration+Link';
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-2 w-full">
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
                    <LinkIcon size={14} className="text-[#8C6C38] shrink-0" />
                    <span className="truncate text-[11px] font-mono">
                      {request.inspirationImageUrl}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Our master karigars reference this design during procurement and quality assessment.
                  </p>
                  {isHttpUrl && (
                    <a
                      href={request.inspirationImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#40000D] text-[#FFE3C7] text-xs font-semibold hover:bg-[#5A0015] transition shadow-xs"
                    >
                      <span>View Full Inspiration</span>
                      <LinkSquare size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Contact Details */}
          <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8C98A]/20 flex items-center justify-between text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-[#8C6C38]" />
              <span>Contact Phone for Updates:</span>
              <span className="font-mono font-semibold text-[#28040B]">{request.phone}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-[#E8C98A]/30 bg-[#FAF6F0] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#40000D] hover:bg-[#5A0015] text-[#FFE3C7] text-xs font-semibold tracking-wide transition cursor-pointer shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
