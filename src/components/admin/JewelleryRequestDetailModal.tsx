import React, { useState } from 'react';
import {
  X,
  LinkSquare,
  Phone,
  Sms,
  Clock,
  Diamonds,
  Alert,
  TickCircle,
  XCircle2,
  FileText,
  Loader,
  ArrowRight,
  ShieldAlert,
  Link2,
} from 'reicon-react';

export interface AdminJewelleryRequest {
  id: string;
  requestNumber: string;
  userId: string;
  customerEmail: string | null;
  customerClerkId: string | null;
  jewelleryType: string;
  description: string;
  inspirationImageUrl: string;
  quantity: number;
  phone: string;
  budget: number | null;
  additionalRequirements: string | null;
  status: string;
  quotedPrice: number | null;
  advanceAmount: number | null;
  remainingAmount: number | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JewelleryRequestDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: AdminJewelleryRequest | null;
  onStatusUpdate: (requestId: string, newStatus: string, adminNote?: string) => Promise<void>;
  onNoteUpdate: (requestId: string, adminNote: string) => Promise<void>;
}

export const JewelleryRequestDetailModal: React.FC<JewelleryRequestDetailModalProps> = ({
  isOpen,
  onClose,
  request,
  onStatusUpdate,
  onNoteUpdate,
}) => {
  const [adminNote, setAdminNote] = useState(request?.adminNote || '');
  const [prevRequestId, setPrevRequestId] = useState(request?.id);
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);

  // Sync adminNote when a different request is opened
  if (request && request.id !== prevRequestId) {
    setPrevRequestId(request.id);
    setAdminNote(request.adminNote || '');
    setActionError(null);
    setConfirmRejectOpen(false);
  }

  // Lock body scroll when modal is open
  React.useEffect(() => {
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

  const handleAction = async (status: string) => {
    setIsUpdating(true);
    setActionError(null);
    try {
      await onStatusUpdate(request.id, status, adminNote.trim() || undefined);
      setConfirmRejectOpen(false);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update request status.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveNote = async () => {
    setIsUpdating(true);
    setActionError(null);
    try {
      await onNoteUpdate(request.id, adminNote.trim());
    } catch (err: any) {
      setActionError(err.message || 'Failed to save admin note.');
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1.5">
            <Clock size={12} /> Pending Review
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-500/15 border border-blue-500/30 text-blue-300 flex items-center gap-1.5">
            <Loader size={12} className="animate-spin" /> Under Review
          </span>
        );
      case 'QUOTE_SENT':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1.5">
            <TickCircle size={12} /> Sourceable (QuoteDown Sent)
          </span>
        );
      case 'NOT_SOURCEABLE':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center gap-1.5">
            <XCircle2 size={12} /> Not Sourceable
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/10 border border-white/20 text-white">
            {status}
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm"
      data-lenis-prevent
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUpdating) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-4xl bg-[#140B1A] border border-[#D6B878]/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] overscroll-contain"
        data-lenis-prevent
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-[#180F20] shrink-0">
          <div className="flex items-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#40000D] border border-[#D6B878]/30 flex items-center justify-center text-[#D6B878] shrink-0">
              <Diamonds size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-mono text-base sm:text-lg font-bold text-[#F8F4EC]">
                  {request.requestNumber}
                </h3>
                {getStatusBadge(request.status)}
              </div>
              <p className="text-[11px] text-white/50">
                Submitted on {new Date(request.createdAt).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isUpdating}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          className="p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 overscroll-contain space-y-6 text-xs text-[#EDE4D5] no-scrollbar scrollbar-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          data-lenis-prevent
        >
          {actionError && (
            <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 flex items-center gap-2">
              <Alert size={16} className="shrink-0 text-red-400" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Inspiration Image & Customer Details */}
            <div className="lg:col-span-5 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#D6B878] block">
                    Inspiration Reference
                  </span>
                  <a
                    href={request.inspirationImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#D6B878] hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Open Reference</span>
                    <LinkSquare size={10} />
                  </a>
                </div>
                
                <div className="relative rounded-xl border border-white/15 bg-black/60 overflow-hidden group">
                  <img
                    src={request.inspirationImageUrl}
                    alt="Customer Inspiration"
                    className="w-full h-56 sm:h-64 object-contain bg-black/40"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://placehold.co/400x400?text=Inspiration+Link+Attached';
                    }}
                  />
                  <div className="p-2.5 bg-black/80 border-t border-white/10 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate text-[11px] text-white/80">
                      <Link2 size={12} className="text-[#D6B878] shrink-0" />
                      <span className="truncate">{request.inspirationImageUrl}</span>
                    </div>
                    <a
                      href={request.inspirationImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded bg-[#D6B878]/20 hover:bg-[#D6B878]/30 border border-[#D6B878]/40 text-[#FFE3C7] text-[10px] font-semibold shrink-0 flex items-center gap-1 transition"
                    >
                      <span>Visit</span>
                      <LinkSquare size={10} />
                    </a>
                  </div>
                </div>
              </div>

              {/* Customer Contact Box */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#D6B878] block">
                  Customer Information
                </span>
                <div className="space-y-2 text-white/80">
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-[#D6B878] shrink-0" />
                    <a
                      href={`tel:${request.phone}`}
                      className="font-mono text-xs font-semibold hover:text-[#D6B878] transition"
                    >
                      {request.phone}
                    </a>
                  </div>
                  {request.customerEmail && (
                    <div className="flex items-center gap-2">
                      <Sms size={14} className="text-[#D6B878] shrink-0" />
                      <a
                        href={`mailto:${request.customerEmail}`}
                        className="truncate hover:text-[#D6B878] transition"
                      >
                        {request.customerEmail}
                      </a>
                    </div>
                  )}
                  <div className="text-[10px] text-white/40 font-mono pt-1">
                    User DB ID: {request.userId}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Sourcing Specifications & Actions */}
            <div className="lg:col-span-7 space-y-5">
              {/* Specifications Card */}
              <div className="p-4 sm:p-5 rounded-xl bg-white/5 border border-white/10 space-y-4">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#D6B878] block">
                  Request Specifications
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-white/90">
                  <div className="p-2.5 rounded-lg bg-black/30 border border-white/5">
                    <span className="text-[10px] text-white/40 block">Category</span>
                    <span className="font-semibold text-xs text-[#FFE3C7]">
                      {request.jewelleryType}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/30 border border-white/5">
                    <span className="text-[10px] text-white/40 block">Quantity</span>
                    <span className="font-semibold text-xs text-[#FFE3C7]">
                      {request.quantity} unit{request.quantity > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-white/40 block">Target Budget</span>
                    <span className="font-semibold text-xs text-[#FFE3C7]">
                      {request.budget ? `₹${request.budget.toLocaleString('en-IN')}` : 'Flexible / Unspecified'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-white/40 uppercase font-semibold">
                    Customer Description
                  </span>
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5 text-xs text-white/90 leading-relaxed whitespace-pre-wrap">
                    {request.description}
                  </div>
                </div>

                {request.additionalRequirements && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-white/40 uppercase font-semibold">
                      Additional Requirements
                    </span>
                    <div className="p-3 rounded-lg bg-black/40 border border-white/5 text-xs text-white/80 leading-relaxed whitespace-pre-wrap">
                      {request.additionalRequirements}
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Note Section */}
              <div className="p-4 sm:p-5 rounded-xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#D6B878] flex items-center gap-1.5">
                    <FileText size={12} /> Internal Atelier Note
                  </span>
                  <button
                    onClick={handleSaveNote}
                    disabled={isUpdating}
                    className="text-[11px] text-[#D6B878] hover:text-white font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {isUpdating ? 'Saving...' : 'Save Note Only'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Add internal notes on karigar sourcing feasibility, estimated material cost, craftsman availability, or reason for rejection..."
                  className="w-full bg-black/40 text-xs text-white p-3 rounded-xl border border-white/15 focus:border-[#D6B878] focus:outline-none"
                  disabled={isUpdating}
                />
              </div>

              {/* Sourcing Decision Workflow Controls */}
              <div className="p-4 sm:p-5 rounded-xl bg-[#180F20] border border-[#D6B878]/30 space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#D6B878] block">
                  Atelier Sourcing Decision
                </span>

                {request.status === 'PENDING' && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-white/60">
                      Step 1: Check availability and karigar feasibility.
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        onClick={() => handleAction('UNDER_REVIEW')}
                        disabled={isUpdating}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#40000D] to-[#5A0015] border border-[#D6B878]/40 text-[#FFE3C7] text-xs font-semibold hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isUpdating ? <Loader size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                        <span>Mark Under Review</span>
                      </button>

                      <button
                        onClick={() => setConfirmRejectOpen(true)}
                        disabled={isUpdating}
                        className="py-2.5 px-4 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle2 size={14} />
                        <span>Not Sourceable</span>
                      </button>
                    </div>
                  </div>
                )}

                {request.status === 'UNDER_REVIEW' && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-white/60">
                      Step 2: Confirm sourcing feasibility or decline design.
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        onClick={() => handleAction('QUOTE_SENT')}
                        disabled={isUpdating}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-800 to-emerald-700 border border-emerald-500/40 text-emerald-100 text-xs font-semibold hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                      >
                        {isUpdating ? <Loader size={14} className="animate-spin" /> : <TickCircle size={14} />}
                        <span>Mark Sourceable (Progress to QuoteDown)</span>
                      </button>

                      <button
                        onClick={() => setConfirmRejectOpen(true)}
                        disabled={isUpdating}
                        className="py-2.5 px-4 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle2 size={14} />
                        <span>Not Sourceable</span>
                      </button>
                    </div>
                  </div>
                )}

                {request.status === 'QUOTE_SENT' && (
                  <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                    <TickCircle size={16} className="shrink-0 text-emerald-400" />
                    <span>
                      Request is marked <strong>Sourceable</strong>. Quotation and advance payment workflow will be managed in upcoming tasks.
                    </span>
                  </div>
                )}

                {request.status === 'NOT_SOURCEABLE' && (
                  <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                    <XCircle2 size={16} className="shrink-0 text-rose-400" />
                    <span>
                      This request has been marked <strong>Not Sourceable</strong>.
                    </span>
                  </div>
                )}

                {/* Reject Confirmation Dialog */}
                {confirmRejectOpen && (
                  <div className="p-4 rounded-xl bg-red-950/80 border border-red-500/50 space-y-3 mt-3 animate-fadeIn">
                    <div className="flex items-center gap-2 text-red-200 font-semibold text-xs">
                      <ShieldAlert size={16} className="text-red-400" />
                      <span>Confirm Design Cannot Be Sourced</span>
                    </div>
                    <p className="text-[11px] text-red-200/80">
                      Are you sure Alongkar cannot source this piece? You can save an internal reason in the note above before confirming.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setConfirmRejectOpen(false)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAction('NOT_SOURCEABLE')}
                        disabled={isUpdating}
                        className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isUpdating ? <Loader size={12} className="animate-spin" /> : null}
                        <span>Confirm Not Sourceable</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
