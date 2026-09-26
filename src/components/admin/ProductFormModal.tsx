import React, { useState, useEffect } from 'react';
import { X, Sparkles, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import type { Product } from '../../types';

interface ProductFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialProduct?: Product | null;
  isLoading: boolean;
  apiError: string | null;
  onSubmit: (formData: any) => Promise<void>;
  onClose: () => void;
}

const CATEGORIES = [
  { value: 'bracelets', label: 'Bracelets' },
  { value: 'necklaces', label: 'Necklaces' },
  { value: 'earrings', label: 'Earrings' },
  { value: 'rings', label: 'Rings' },
  { value: 'chains', label: 'Chains' },
  { value: 'pendants', label: 'Pendants' },
];

const COLLECTIONS = [
  { value: '', label: 'None (Standard)' },
  { value: 'everyday-elegance', label: 'Everyday Elegance' },
  { value: 'festive-glow', label: 'Festive Glow' },
  { value: 'the-minimalist', label: 'The Minimalist' },
  { value: 'statement', label: 'Statement Masterworks' },
];

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  mode,
  initialProduct,
  isLoading,
  apiError,
  onSubmit,
  onClose,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    category: 'bracelets',
    collectionId: '',
    price: 999,
    originalPrice: 1899,
    discountPercent: 47,
    rating: 4.8,
    reviewCount: 24,
    isNew: false,
    isBestSeller: false,
    isTrending: false,
    image: '',
    hoverImage: '',
    description: '',
    finish: '24K Micron Gold Plated',
    baseMaterial: 'High-Grade Brass Alloy',
    stoneType: '',
    warranty: '6 Months Polish Guarantee',
    inStock: true,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [autoSlug, setAutoSlug] = useState(mode === 'create');

  useEffect(() => {
    if (initialProduct && mode === 'edit') {
      setFormData({
        name: initialProduct.name || '',
        slug: initialProduct.slug || '',
        category: initialProduct.category || 'bracelets',
        collectionId: initialProduct.collectionId || '',
        price: initialProduct.price ?? 999,
        originalPrice: initialProduct.originalPrice ?? 1899,
        discountPercent: initialProduct.discountPercent ?? 0,
        rating: initialProduct.rating ?? 4.8,
        reviewCount: initialProduct.reviewCount ?? 0,
        isNew: Boolean(initialProduct.isNew),
        isBestSeller: Boolean(initialProduct.isBestSeller),
        isTrending: Boolean(initialProduct.isTrending),
        image: initialProduct.image || '',
        hoverImage: initialProduct.hoverImage || '',
        description: initialProduct.description || '',
        finish: initialProduct.details?.finish || '24K Micron Gold Plated',
        baseMaterial: initialProduct.details?.baseMaterial || 'High-Grade Brass Alloy',
        stoneType: initialProduct.details?.stoneType || '',
        warranty: initialProduct.details?.warranty || '6 Months Polish Guarantee',
        inStock: initialProduct.inStock ?? true,
      });
      setAutoSlug(false);
    } else {
      setFormData({
        name: '',
        slug: '',
        category: 'bracelets',
        collectionId: '',
        price: 999,
        originalPrice: 1899,
        discountPercent: 47,
        rating: 4.8,
        reviewCount: 0,
        isNew: true,
        isBestSeller: false,
        isTrending: false,
        image: '',
        hoverImage: '',
        description: '',
        finish: '24K Micron Gold Plated',
        baseMaterial: 'High-Grade Brass Alloy',
        stoneType: '',
        warranty: '6 Months Polish Guarantee',
        inStock: true,
      });
      setAutoSlug(true);
    }
    setFormErrors({});
  }, [initialProduct, mode, isOpen]);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name: newName,
      slug: autoSlug ? generateSlug(newName) : prev.slug,
    }));
  };

  const handlePriceChange = (price: number, origPrice: number) => {
    let discount = 0;
    if (origPrice > 0 && price >= 0) {
      discount = Math.max(0, Math.round(((origPrice - price) / origPrice) * 100));
    }
    setFormData((prev) => ({
      ...prev,
      price,
      originalPrice: origPrice,
      discountPercent: discount,
    }));
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) errors.name = 'Product name is required';
    if (!formData.slug.trim()) errors.slug = 'Slug is required';
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formData.slug.trim())) {
      errors.slug = 'Slug must contain only lowercase letters, numbers, and hyphens';
    }
    if (formData.price < 0) errors.price = 'Price cannot be negative';
    if (formData.originalPrice < 0) errors.originalPrice = 'Original price cannot be negative';
    if (!formData.image.trim()) errors.image = 'Primary image URL is required';
    if (!formData.hoverImage.trim()) errors.hoverImage = 'Hover image URL is required';
    if (!formData.description.trim()) errors.description = 'Description is required';
    if (!formData.finish.trim()) errors.finish = 'Finish detail is required';
    if (!formData.baseMaterial.trim()) errors.baseMaterial = 'Base material is required';
    if (!formData.warranty.trim()) errors.warranty = 'Warranty detail is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      name: formData.name.trim(),
      slug: formData.slug.trim(),
      category: formData.category,
      collectionId: formData.collectionId ? formData.collectionId : null,
      price: Number(formData.price),
      originalPrice: Number(formData.originalPrice),
      discountPercent: Number(formData.discountPercent),
      rating: Number(formData.rating),
      reviewCount: Number(formData.reviewCount),
      isNew: formData.isNew,
      isBestSeller: formData.isBestSeller,
      isTrending: formData.isTrending,
      image: formData.image.trim(),
      hoverImage: formData.hoverImage.trim(),
      description: formData.description.trim(),
      finish: formData.finish.trim(),
      baseMaterial: formData.baseMaterial.trim(),
      stoneType: formData.stoneType.trim() ? formData.stoneType.trim() : null,
      warranty: formData.warranty.trim(),
      inStock: formData.inStock,
    };

    await onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div
        className="relative w-full max-w-3xl my-8 bg-[#180F20] border border-[#D6B878]/30 rounded-2xl text-white shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-[#140B1A] rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#B08D57] to-[#D6B878] text-[#211A17] flex items-center justify-center font-bold text-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#F8F4EC]">
                {mode === 'create' ? 'Create New Masterwork' : 'Edit Product'}
              </h2>
              <p className="text-[11px] text-[#EDE4D5]/60">
                {mode === 'create'
                  ? 'Add a new piece to the PostgreSQL database catalog'
                  : `Updating: ${initialProduct?.name}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-white/40 hover:text-white transition p-1.5 rounded-lg hover:bg-white/10"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {apiError && (
            <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-500/40 text-red-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-xs text-red-200">API Error</p>
                <p className="text-[11px] text-red-300/90">{apiError}</p>
              </div>
            </div>
          )}

          {/* Section 1: Basic Info */}
          <div className="space-y-4">
            <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#D6B878] pb-1 border-b border-white/10">
              1. General Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Product Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={handleNameChange}
                  placeholder="e.g. Nitya Delicate Crystal Tennis Bracelet"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border ${
                    formErrors.name ? 'border-red-500' : 'border-white/15'
                  } focus:outline-none focus:border-[#D6B878] text-white`}
                />
                {formErrors.name && (
                  <p className="text-[10px] text-red-400 mt-1">{formErrors.name}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[#EDE4D5]/90 font-medium">
                    Slug <span className="text-red-400">*</span>
                  </label>
                  <label className="text-[10px] text-[#D6B878] flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSlug}
                      onChange={(e) => setAutoSlug(e.target.checked)}
                      className="rounded accent-[#D6B878]"
                    />
                    <span>Auto from name</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => {
                    setAutoSlug(false);
                    setFormData({ ...formData, slug: e.target.value });
                  }}
                  placeholder="e.g. nitya-delicate-crystal-tennis-bracelet"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border ${
                    formErrors.slug ? 'border-red-500' : 'border-white/15'
                  } focus:outline-none focus:border-[#D6B878] text-white font-mono text-[11px]`}
                />
                {formErrors.slug && (
                  <p className="text-[10px] text-red-400 mt-1">{formErrors.slug}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Category <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 focus:outline-none focus:border-[#D6B878] text-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value} className="bg-[#180F20]">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Collection (Optional)
                </label>
                <select
                  value={formData.collectionId}
                  onChange={(e) => setFormData({ ...formData, collectionId: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 focus:outline-none focus:border-[#D6B878] text-white"
                >
                  {COLLECTIONS.map((col) => (
                    <option key={col.value} value={col.value} className="bg-[#180F20]">
                      {col.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                Description <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the artisan handiwork, inspiration, and styling..."
                className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border ${
                  formErrors.description ? 'border-red-500' : 'border-white/15'
                } focus:outline-none focus:border-[#D6B878] text-white leading-relaxed`}
              />
              {formErrors.description && (
                <p className="text-[10px] text-red-400 mt-1">{formErrors.description}</p>
              )}
            </div>
          </div>

          {/* Section 2: Pricing & Inventory */}
          <div className="space-y-4">
            <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#D6B878] pb-1 border-b border-white/10">
              2. Pricing & Stock
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Selling Price (₹) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.price}
                  onChange={(e) => handlePriceChange(Number(e.target.value), formData.originalPrice)}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border ${
                    formErrors.price ? 'border-red-500' : 'border-white/15'
                  } focus:outline-none focus:border-[#D6B878] text-white font-mono`}
                />
                {formErrors.price && (
                  <p className="text-[10px] text-red-400 mt-1">{formErrors.price}</p>
                )}
              </div>

              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Original Price (₹) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.originalPrice}
                  onChange={(e) => handlePriceChange(formData.price, Number(e.target.value))}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border ${
                    formErrors.originalPrice ? 'border-red-500' : 'border-white/15'
                  } focus:outline-none focus:border-[#D6B878] text-white font-mono`}
                />
              </div>

              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Discount (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.discountPercent}
                  onChange={(e) => setFormData({ ...formData, discountPercent: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 focus:outline-none focus:border-[#D6B878] text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <label className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/10 cursor-pointer hover:bg-black/50 transition">
                <input
                  type="checkbox"
                  checked={formData.inStock}
                  onChange={(e) => setFormData({ ...formData, inStock: e.target.checked })}
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                <div>
                  <p className="font-semibold text-white">In Stock</p>
                  <p className="text-[10px] text-white/50">Available for customer checkout</p>
                </div>
              </label>

              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col items-center justify-center p-2 rounded-xl bg-black/30 border border-white/10 cursor-pointer hover:bg-black/50 transition text-center">
                  <input
                    type="checkbox"
                    checked={formData.isNew}
                    onChange={(e) => setFormData({ ...formData, isNew: e.target.checked })}
                    className="accent-[#D6B878] mb-1"
                  />
                  <span className="text-[10px] font-medium text-white">New</span>
                </label>
                <label className="flex flex-col items-center justify-center p-2 rounded-xl bg-black/30 border border-white/10 cursor-pointer hover:bg-black/50 transition text-center">
                  <input
                    type="checkbox"
                    checked={formData.isBestSeller}
                    onChange={(e) => setFormData({ ...formData, isBestSeller: e.target.checked })}
                    className="accent-[#D6B878] mb-1"
                  />
                  <span className="text-[10px] font-medium text-white">Bestseller</span>
                </label>
                <label className="flex flex-col items-center justify-center p-2 rounded-xl bg-black/30 border border-white/10 cursor-pointer hover:bg-black/50 transition text-center">
                  <input
                    type="checkbox"
                    checked={formData.isTrending}
                    onChange={(e) => setFormData({ ...formData, isTrending: e.target.checked })}
                    className="accent-[#D6B878] mb-1"
                  />
                  <span className="text-[10px] font-medium text-white">Trending</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section 3: Product Specifications */}
          <div className="space-y-4">
            <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#D6B878] pb-1 border-b border-white/10">
              3. Specifications & Guarantee
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Finish <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.finish}
                  onChange={(e) => setFormData({ ...formData, finish: e.target.value })}
                  placeholder="e.g. 24K Micron Gold Plated"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 focus:outline-none focus:border-[#D6B878] text-white"
                />
              </div>

              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Base Material <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.baseMaterial}
                  onChange={(e) => setFormData({ ...formData, baseMaterial: e.target.value })}
                  placeholder="e.g. High-Grade Brass Alloy"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 focus:outline-none focus:border-[#D6B878] text-white"
                />
              </div>

              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Stone Type (Optional)
                </label>
                <input
                  type="text"
                  value={formData.stoneType}
                  onChange={(e) => setFormData({ ...formData, stoneType: e.target.value })}
                  placeholder="e.g. AAA Cubic Zirconia, Hydro Ruby"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 focus:outline-none focus:border-[#D6B878] text-white"
                />
              </div>

              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Warranty / Polish Guarantee <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.warranty}
                  onChange={(e) => setFormData({ ...formData, warranty: e.target.value })}
                  placeholder="e.g. 6 Months Polish Guarantee"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 focus:outline-none focus:border-[#D6B878] text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Imagery */}
          <div className="space-y-4">
            <h3 className="text-[11px] uppercase tracking-wider font-bold text-[#D6B878] pb-1 border-b border-white/10">
              4. Product Imagery
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Primary Image URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border ${
                    formErrors.image ? 'border-red-500' : 'border-white/15'
                  } focus:outline-none focus:border-[#D6B878] text-white text-[11px]`}
                />
                {formErrors.image && (
                  <p className="text-[10px] text-red-400 mt-1">{formErrors.image}</p>
                )}
                {formData.image && (
                  <div className="mt-2 flex items-center gap-2 p-2 bg-black/30 rounded-lg border border-white/10">
                    <img
                      src={formData.image}
                      alt="Primary preview"
                      className="w-12 h-12 object-cover rounded bg-black"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=Invalid';
                      }}
                    />
                    <span className="text-[10px] text-white/50 truncate flex items-center gap-1">
                      <ImageIcon className="w-3 h-3 text-[#D6B878]" /> Primary Preview
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[#EDE4D5]/90 font-medium mb-1.5">
                  Hover Image URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={formData.hoverImage}
                  onChange={(e) => setFormData({ ...formData, hoverImage: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border ${
                    formErrors.hoverImage ? 'border-red-500' : 'border-white/15'
                  } focus:outline-none focus:border-[#D6B878] text-white text-[11px]`}
                />
                {formErrors.hoverImage && (
                  <p className="text-[10px] text-red-400 mt-1">{formErrors.hoverImage}</p>
                )}
                {formData.hoverImage && (
                  <div className="mt-2 flex items-center gap-2 p-2 bg-black/30 rounded-lg border border-white/10">
                    <img
                      src={formData.hoverImage}
                      alt="Hover preview"
                      className="w-12 h-12 object-cover rounded bg-black"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=Invalid';
                      }}
                    />
                    <span className="text-[10px] text-white/50 truncate flex items-center gap-1">
                      <ImageIcon className="w-3 h-3 text-[#D6B878]" /> Hover Preview
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-[#140B1A] rounded-b-2xl shrink-0">
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
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#B08D57] to-[#D6B878] text-[#211A17] font-semibold text-xs hover:brightness-110 transition shadow-lg flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving to Database...</span>
              </>
            ) : (
              <>
                <span>{mode === 'create' ? 'Create Product' : 'Save Changes'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
