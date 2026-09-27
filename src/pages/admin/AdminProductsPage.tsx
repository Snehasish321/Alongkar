import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import {
  Plus,
  Search,
  Filter,
  Gem,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  RefreshCw,
  Sparkles,
  AlertCircle,
  TrendingUp,
  Award,
  Package,
} from 'lucide-react';
import type { Product } from '../../types';
import { ProductFormModal } from '../../components/admin/ProductFormModal';
import { DeleteConfirmModal } from '../../components/admin/DeleteConfirmModal';

export const AdminProductsPage: React.FC = () => {
  const { getToken } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isFormLoading, setIsFormLoading] = useState(false);
  const [formApiError, setFormApiError] = useState<string | null>(null);

  // Delete modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  // Success Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch products from GET /api/products
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/products');
      if (!res.ok) {
        throw new Error(`Failed to load products (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (Array.isArray(data.products)) {
        setProducts(data.products);
      } else {
        setProducts([]);
      }
    } catch (err: any) {
      console.error('Error fetching products:', err);
      setError(err.message || 'Unable to connect to the Product API');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Client-side search and filtering
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.slug.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query);

      const matchesCategory =
        categoryFilter === 'all' || product.category.toLowerCase() === categoryFilter.toLowerCase();

      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'in-stock' && product.inStock) ||
        (stockFilter === 'out-of-stock' && !product.inStock);

      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, searchQuery, categoryFilter, stockFilter]);

  // Product Counts for KPI stats
  const stats = useMemo(() => {
    const total = products.length;
    const inStockCount = products.filter((p) => p.inStock).length;
    const bestSellersCount = products.filter((p) => p.isBestSeller).length;
    const trendingCount = products.filter((p) => p.isTrending).length;
    return { total, inStockCount, bestSellersCount, trendingCount };
  }, [products]);

  // Handle Create / Edit Submission
  const handleFormSubmit = async (formData: any) => {
    setIsFormLoading(true);
    setFormApiError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication session token is missing. Please sign in again.');
      }

      if (formMode === 'create') {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Creation failed with status ${res.status}`);
        }

        showToast(`✨ Product "${formData.name}" created successfully in database.`);
      } else if (formMode === 'edit' && selectedProduct) {
        const res = await fetch(`/api/products?id=${encodeURIComponent(selectedProduct.id)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Update failed with status ${res.status}`);
        }

        showToast(`✨ Product "${formData.name}" updated successfully.`);
      }

      setIsFormModalOpen(false);
      await fetchProducts();
    } catch (err: any) {
      console.error('Error submitting product form:', err);
      setFormApiError(err.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsFormLoading(false);
    }
  };

  // Handle Delete Confirmation
  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;
    setIsDeleteLoading(true);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication session token is missing. Please sign in again.');
      }

      const res = await fetch(`/api/products?id=${encodeURIComponent(productToDelete.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Deletion failed with status ${res.status}`);
      }

      showToast(`🗑️ Product "${productToDelete.name}" deleted from database.`);
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
      await fetchProducts();
    } catch (err: any) {
      console.error('Error deleting product:', err);
      alert(err.message || 'Failed to delete product.');
    } finally {
      setIsDeleteLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-gradient-to-r from-[#180F20] to-[#2A0008] border border-[#D6B878] text-[#F8F4EC] shadow-2xl flex items-center gap-3 animate-fade-in text-xs font-medium">
          <Sparkles className="w-4 h-4 text-[#D6B878]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#F8F4EC]">
              Product Masterworks
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#40000D] border border-[#D6B878]/30 text-[#D6B878] text-[11px] font-mono font-semibold">
              {stats.total} In Database
            </span>
          </div>
          <p className="text-xs text-[#EDE4D5]/70 mt-1">
            Manage your 24K city-gold catalog, pricing, specifications, and availability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchProducts}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition disabled:opacity-50 cursor-pointer"
            title="Refresh Products"
            aria-label="Refresh Products"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setSelectedProduct(null);
              setFormMode('create');
              setFormApiError(null);
              setIsFormModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#B08D57] to-[#D6B878] text-[#211A17] font-semibold text-xs hover:brightness-110 transition shadow-lg flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Masterwork</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#140B1A] border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-[11px]">
            <span>Total Catalog</span>
            <Package className="w-4 h-4 text-[#D6B878]" />
          </div>
          <p className="font-serif text-2xl font-bold text-white">{stats.total}</p>
          <p className="text-[10px] text-white/40">Active database records</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#140B1A] border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-[11px]">
            <span>In Stock</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="font-serif text-2xl font-bold text-emerald-400">{stats.inStockCount}</p>
          <p className="text-[10px] text-white/40">Ready for order fulfillment</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#140B1A] border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-[11px]">
            <span>Bestsellers</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <p className="font-serif text-2xl font-bold text-amber-300">{stats.bestSellersCount}</p>
          <p className="text-[10px] text-white/40">Flagged for premier showcase</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#140B1A] border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-white/50 text-[11px]">
            <span>Trending</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <p className="font-serif text-2xl font-bold text-purple-300">{stats.trendingCount}</p>
          <p className="text-[10px] text-white/40">Viral & festive pieces</p>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-[#140B1A] border border-white/10">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, slug, or keywords..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#D6B878]"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white">
            <Filter className="w-3.5 h-3.5 text-[#D6B878]" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#180F20]">All Categories</option>
              <option value="bracelets" className="bg-[#180F20]">Bracelets</option>
              <option value="necklaces" className="bg-[#180F20]">Necklaces</option>
              <option value="earrings" className="bg-[#180F20]">Earrings</option>
              <option value="rings" className="bg-[#180F20]">Rings</option>
              <option value="chains" className="bg-[#180F20]">Chains</option>
              <option value="pendants" className="bg-[#180F20]">Pendants</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white">
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#180F20]">All Stock</option>
              <option value="in-stock" className="bg-[#180F20]">In Stock</option>
              <option value="out-of-stock" className="bg-[#180F20]">Out of Stock</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchProducts}
            className="px-3 py-1 rounded-lg bg-red-800/60 hover:bg-red-700 text-white text-[11px] font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Products Table Container */}
      <div className="rounded-2xl border border-white/10 bg-[#140B1A] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-white/80">
            <thead className="bg-[#180F20] text-[11px] uppercase tracking-wider text-[#D6B878] font-bold border-b border-white/10">
              <tr>
                <th className="py-3.5 px-4">Masterwork</th>
                <th className="py-3.5 px-4">Category / Style</th>
                <th className="py-3.5 px-4">Price</th>
                <th className="py-3.5 px-4">Stock Status</th>
                <th className="py-3.5 px-4">Highlights</th>
                <th className="py-3.5 px-4">Rating</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-white/50">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 border-2 border-[#D6B878]/30 border-t-[#D6B878] rounded-full animate-spin" />
                      <p className="text-xs">Loading Alongkar database masterworks...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-white/40">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Gem className="w-10 h-10 text-white/20" />
                      <p className="text-sm font-semibold text-white/70">No products found</p>
                      <p className="text-xs text-white/40">
                        Try changing your search query or category filter.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-white/[0.03] transition group"
                  >
                    {/* Masterwork column (image + title + slug) */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-12 h-12 rounded-xl object-cover bg-black/60 shrink-0 border border-white/10"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=No+Img';
                          }}
                        />
                        <div className="min-w-0 max-w-xs">
                          <p className="font-semibold text-white truncate text-xs group-hover:text-[#FFE3C7] transition">
                            {product.name}
                          </p>
                          <p className="text-[10px] text-[#D6B878]/70 font-mono truncate">
                            /{product.slug}
                          </p>
                          <p className="text-[10px] text-white/40 font-mono">
                            ID: {product.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Category & Collection */}
                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-medium capitalize text-white">
                        {product.category}
                      </span>
                      {product.collectionId && (
                        <p className="text-[10px] text-[#D6B878]/80 font-serif italic mt-0.5">
                          {product.collectionId.replace(/-/g, ' ')}
                        </p>
                      )}
                    </td>

                    {/* Pricing */}
                    <td className="py-3.5 px-4">
                      <p className="font-mono font-semibold text-white">
                        ₹{product.price.toLocaleString('en-IN')}
                      </p>
                      {product.originalPrice > product.price && (
                        <p className="text-[10px] text-white/40 line-through font-mono">
                          ₹{product.originalPrice.toLocaleString('en-IN')}
                        </p>
                      )}
                      {product.discountPercent > 0 && (
                        <span className="text-[9px] text-emerald-400 font-mono font-semibold">
                          {product.discountPercent}% OFF
                        </span>
                      )}
                    </td>

                    {/* Stock Status */}
                    <td className="py-3.5 px-4">
                      {product.inStock ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>In Stock</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Out of Stock</span>
                        </span>
                      )}
                    </td>

                    {/* Badges / Highlights */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {product.isNew && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-semibold uppercase">
                            New
                          </span>
                        )}
                        {product.isBestSeller && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-semibold uppercase">
                            Bestseller
                          </span>
                        )}
                        {product.isTrending && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[9px] font-semibold uppercase">
                            Trending
                          </span>
                        )}
                        {!product.isNew && !product.isBestSeller && !product.isTrending && (
                          <span className="text-[10px] text-white/30">&mdash;</span>
                        )}
                      </div>
                    </td>

                    {/* Rating & Reviews */}
                    <td className="py-3.5 px-4 font-mono text-[11px]">
                      <span className="text-amber-400">★ {product.rating}</span>
                      <span className="text-white/40 text-[10px] ml-1">({product.reviewCount})</span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedProduct(product);
                            setFormMode('edit');
                            setFormApiError(null);
                            setIsFormModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
                          title="Edit Product"
                          aria-label={`Edit ${product.name}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setProductToDelete(product);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 transition cursor-pointer"
                          title="Delete Product"
                          aria-label={`Delete ${product.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Form Modal (Create & Edit) */}
      <ProductFormModal
        isOpen={isFormModalOpen}
        mode={formMode}
        initialProduct={selectedProduct}
        isLoading={isFormLoading}
        apiError={formApiError}
        onSubmit={handleFormSubmit}
        onClose={() => {
          if (!isFormLoading) {
            setIsFormModalOpen(false);
            setSelectedProduct(null);
          }
        }}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        product={productToDelete}
        isLoading={isDeleteLoading}
        onConfirm={handleDeleteConfirm}
        onClose={() => {
          if (!isDeleteLoading) {
            setIsDeleteModalOpen(false);
            setProductToDelete(null);
          }
        }}
      />
    </div>
  );
};
