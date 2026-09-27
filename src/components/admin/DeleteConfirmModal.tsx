import React from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';
import type { Product } from '../../types';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  product: Product | null;
  isLoading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  product,
  isLoading,
  onConfirm,
  onClose,
}) => {
  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-md bg-[#180F20] border border-red-500/30 rounded-2xl p-6 text-white shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-500/40 text-red-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#F8F4EC]">
                Confirm Product Deletion
              </h3>
              <p className="text-xs text-[#EDE4D5]/60">
                This action cannot be undone.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-white/40 hover:text-white transition p-1 rounded-lg hover:bg-white/10"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product preview card */}
        <div className="flex items-center gap-3.5 p-3 rounded-xl bg-black/40 border border-white/10">
          <img
            src={product.image}
            alt={product.name}
            className="w-14 h-14 object-cover rounded-lg bg-black/60 shrink-0 border border-white/10"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=No+Image';
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#F8F4EC] truncate">
              {product.name}
            </p>
            <p className="text-[11px] text-[#D6B878] font-mono mt-0.5">
              ₹{product.price.toLocaleString('en-IN')} &bull; <span className="capitalize">{product.category}</span>
            </p>
            <p className="text-[10px] text-white/40 font-mono truncate mt-0.5">
              ID: {product.id}
            </p>
          </div>
        </div>

        <p className="text-xs text-[#EDE4D5]/75 leading-relaxed">
          Are you sure you want to permanently delete <strong>&quot;{product.name}&quot;</strong> from the Alongkar catalog? Any associated cart and wishlist links will also be safely removed.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl border border-white/15 text-xs font-semibold text-[#EDE4D5]/80 hover:bg-white/10 transition disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-lg transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Product</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
