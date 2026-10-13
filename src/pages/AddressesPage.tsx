import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useUser, SignInButton } from '@clerk/react';
import {
  MapPin,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Home,
  Check,
  Shield,
} from 'lucide-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import { Button } from '../components/ui/Button';
import type { SavedAddress, SavedAddressInput } from '../types';
import {
  fetchSavedAddresses,
  createSavedAddress,
  updateSavedAddress,
  deleteSavedAddress,
  setDefaultSavedAddress,
} from '../services/addressApi';

export const AddressesPage: React.FC = () => {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Delete confirmation modal state
  const [addressToDelete, setAddressToDelete] = useState<SavedAddress | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form inputs
  const [formData, setFormData] = useState<SavedAddressInput>({
    recipientName: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    isDefault: false,
  });

  // Load addresses safely for the authenticated customer
  const loadAddresses = useCallback(async () => {
    if (!isSignedIn) {
      setAddresses([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const data = await fetchSavedAddresses(token);
      setAddresses(data);
    } catch (err: any) {
      console.error('Error loading saved addresses:', err);
      setError(err.message || 'Unable to load saved addresses. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [getToken, isSignedIn]);

  // Reload when customer identity changes or on mount
  useEffect(() => {
    if (isLoaded) {
      if (isSignedIn) {
        loadAddresses();
      } else {
        setAddresses([]);
        setIsLoading(false);
      }
    }
  }, [isLoaded, isSignedIn, user?.id, loadAddresses]);

  // Clear success notification after 4 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const openAddModal = () => {
    setEditingAddress(null);
    setFormData({
      recipientName: user?.fullName || user?.firstName || '',
      phone: user?.primaryPhoneNumber?.phoneNumber?.replace(/[^0-9]/g, '').slice(-10) || '',
      line1: '',
      line2: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
      isDefault: addresses.length === 0,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (addr: SavedAddress) => {
    setEditingAddress(addr);
    setFormData({
      recipientName: addr.recipientName,
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2 || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      country: addr.country || 'India',
      isDefault: addr.isDefault,
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    const name = formData.recipientName.trim();
    if (!name) {
      errs.recipientName = 'Recipient name is required';
    } else if (name.length < 2 || name.length > 100) {
      errs.recipientName = 'Recipient name must be between 2 and 100 characters';
    }

    const cleanPhone = formData.phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      errs.phone = 'Mobile phone number is required';
    } else if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      errs.phone = 'Enter a valid 10-digit Indian mobile number (starts with 6, 7, 8, or 9)';
    }

    const line1 = formData.line1.trim();
    if (!line1) {
      errs.line1 = 'Address line 1 is required';
    } else if (line1.length < 3 || line1.length > 200) {
      errs.line1 = 'Address line 1 must be between 3 and 200 characters';
    }

    if (formData.line2 && formData.line2.trim().length > 200) {
      errs.line2 = 'Address line 2 must not exceed 200 characters';
    }

    const city = formData.city.trim();
    if (!city) {
      errs.city = 'City / Town is required';
    } else if (city.length < 2 || city.length > 100) {
      errs.city = 'City must be between 2 and 100 characters';
    }

    const state = formData.state.trim();
    if (!state) {
      errs.state = 'State is required';
    } else if (state.length < 2 || state.length > 100) {
      errs.state = 'State must be between 2 and 100 characters';
    }

    const pin = formData.pincode.trim();
    if (!pin) {
      errs.pincode = 'Six-digit PIN code is required';
    } else if (!/^[1-9]\d{5}$/.test(pin)) {
      errs.pincode = 'PIN code must be exactly 6 numeric digits';
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const payload: SavedAddressInput = {
        recipientName: formData.recipientName.trim(),
        phone: formData.phone.replace(/[^0-9]/g, '').slice(-10),
        line1: formData.line1.trim(),
        line2: formData.line2?.trim() || null,
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
        country: formData.country?.trim() || 'India',
        isDefault: formData.isDefault,
      };

      if (editingAddress) {
        await updateSavedAddress(token, editingAddress.id, payload);
        setSuccessMessage('Address updated successfully.');
      } else {
        await createSavedAddress(token, payload);
        setSuccessMessage('New address saved to your account.');
      }

      setIsModalOpen(false);
      await loadAddresses();
    } catch (err: any) {
      console.error('Error saving address:', err);
      setError(err.message || 'Failed to save address. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (addressId: string) => {
    try {
      const token = await getToken();
      await setDefaultSavedAddress(token, addressId);
      setSuccessMessage('Default address updated.');
      await loadAddresses();
    } catch (err: any) {
      console.error('Error setting default address:', err);
      setError(err.message || 'Failed to update default address.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!addressToDelete) return;
    setIsDeleting(true);
    setError(null);

    try {
      const token = await getToken();
      await deleteSavedAddress(token, addressToDelete.id);
      setSuccessMessage('Address removed from your address book.');
      setAddressToDelete(null);
      await loadAddresses();
    } catch (err: any) {
      console.error('Error deleting address:', err);
      setError(err.message || 'Failed to delete address.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isLoaded) {
    return (
      <StorefrontLayout>
        <div className="min-h-[60vh] flex items-center justify-center bg-[#FFFDF8]" aria-busy="true">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-[#8C6C38] animate-spin" />
            <p className="text-xs font-serif uppercase tracking-widest text-[#666666]">
              Loading your addresses...
            </p>
          </div>
        </div>
      </StorefrontLayout>
    );
  }

  if (!isSignedIn) {
    return (
      <StorefrontLayout>
        <div className="min-h-[70vh] flex items-center justify-center bg-[#FFFDF8] py-16 px-4">
          <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-[#E8C98A]/30 shadow-xl text-center">
            <div className="w-16 h-16 rounded-full bg-[#28040B]/5 border border-[#E8C98A]/40 flex items-center justify-center mx-auto mb-6 text-[#8C6C38]">
              <MapPin className="w-8 h-8" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-[#1A1A1A] mb-3">
              Your Saved Addresses
            </h1>
            <p className="text-sm text-[#666666] leading-relaxed mb-8">
              Sign in to your Alongkar account to save, manage, and reuse verified delivery addresses across all your devices.
            </p>
            <SignInButton mode="modal">
              <Button variant="gold" fullWidth className="py-3.5 shadow-md">
                Sign In to View Addresses
              </Button>
            </SignInButton>
          </div>
        </div>
      </StorefrontLayout>
    );
  }

  return (
    <StorefrontLayout>
      <div className="min-h-screen bg-[#FFFDF8] py-10 md:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header & Breadcrumb */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-[#E8C98A]/20">
            <div>
              <div className="flex items-center gap-2 text-xs font-serif uppercase tracking-widest text-[#8C6C38] mb-2">
                <Link to="/" className="hover:underline">Home</Link>
                <span>/</span>
                <span className="text-[#1A1A1A]">Saved Addresses</span>
              </div>
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-[#1A1A1A] tracking-tight">
                Delivery Address Book
              </h1>
              <p className="text-sm text-[#666666] mt-2">
                Manage your delivery destinations for secure checkout and fast artisan dispatch.
              </p>
            </div>

            <Button
              variant="gold"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 py-3 px-5 shrink-0 self-start md:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Address</span>
            </Button>
          </div>

          {/* Feedback Alerts */}
          {successMessage && (
            <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 animate-in fade-in duration-200">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium">{successMessage}</span>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-3 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {/* Main Content Area */}
          <div className="mt-8">
            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-4 text-[#8C6C38]">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-xs font-serif uppercase tracking-widest text-[#666666]">
                  Fetching addresses from your secure account...
                </p>
              </div>
            ) : addresses.length === 0 ? (
              <div className="py-20 px-6 rounded-2xl bg-white border border-[#E8C98A]/20 shadow-sm text-center max-w-lg mx-auto">
                <div className="w-16 h-16 rounded-full bg-[#FAF7F2] border border-[#E8C98A]/40 flex items-center justify-center mx-auto mb-4 text-[#8C6C38]">
                  <Home className="w-8 h-8" />
                </div>
                <h2 className="font-serif text-xl font-bold text-[#1A1A1A] mb-2">
                  No Saved Addresses Yet
                </h2>
                <p className="text-sm text-[#666666] leading-relaxed mb-6">
                  Add your primary residential or gifting address to enjoy streamlined, one-click checkout.
                </p>
                <Button variant="gold" onClick={openAddModal} className="cursor-pointer">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Your First Address
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className={`rounded-2xl p-6 transition-all duration-200 flex flex-col justify-between relative bg-white border ${
                      addr.isDefault
                        ? 'border-[#8C6C38] shadow-md ring-1 ring-[#8C6C38]/20'
                        : 'border-[#E8C98A]/30 hover:border-[#8C6C38]/40 shadow-sm'
                    }`}
                  >
                    {/* Card Top: Recipient & Default Badge */}
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <h3 className="font-serif font-bold text-lg text-[#1A1A1A] truncate">
                            {addr.recipientName}
                          </h3>
                          <p className="text-xs text-[#666666] font-mono mt-0.5">
                            +91 {addr.phone}
                          </p>
                        </div>
                        {addr.isDefault && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#28040B] text-[#FFE3C7] shrink-0 border border-[#E8C98A]/40">
                            <Check className="w-3 h-3" />
                            Default
                          </span>
                        )}
                      </div>

                      {/* Card Body: Address Lines */}
                      <div className="text-sm text-[#444444] leading-relaxed mt-4 space-y-1">
                        <p>{addr.line1}</p>
                        {addr.line2 && <p>{addr.line2}</p>}
                        <p>
                          {addr.city}, {addr.state} — <span className="font-semibold text-[#1A1A1A]">{addr.pincode}</span>
                        </p>
                        <p className="text-xs text-[#888888] font-serif uppercase tracking-wider pt-1">
                          {addr.country || 'India'}
                        </p>
                      </div>
                    </div>

                    {/* Card Bottom: Actions */}
                    <div className="pt-6 mt-6 border-t border-[#FAF7F2] flex items-center justify-between gap-2">
                      <div>
                        {!addr.isDefault ? (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(addr.id)}
                            className="text-xs font-serif uppercase tracking-wider text-[#8C6C38] hover:text-[#28040B] font-semibold transition-colors cursor-pointer"
                          >
                            Set as Default
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                            <Shield className="w-3.5 h-3.5" />
                            Primary Delivery
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(addr)}
                          className="p-2 rounded-lg hover:bg-[#FAF7F2] text-[#666666] hover:text-[#1A1A1A] transition-colors cursor-pointer"
                          title="Edit address"
                          aria-label={`Edit address for ${addr.recipientName}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddressToDelete(addr)}
                          className="p-2 rounded-lg hover:bg-red-50 text-[#999999] hover:text-red-600 transition-colors cursor-pointer"
                          title="Delete address"
                          aria-label={`Delete address for ${addr.recipientName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Address Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="address-modal-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#E8C98A]/40 p-6 md:p-8 my-8">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#FAF7F2]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#28040B]/10 border border-[#E8C98A]/40 flex items-center justify-center text-[#8C6C38]">
                  <MapPin className="w-4 h-4" />
                </div>
                <h2 id="address-modal-title" className="font-serif text-xl font-bold text-[#1A1A1A]">
                  {editingAddress ? 'Edit Delivery Address' : 'Add New Delivery Address'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
                aria-label="Close address modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Recipient Name */}
              <div>
                <label className="block text-xs font-serif uppercase tracking-wider text-[#1A1A1A] font-semibold mb-1.5">
                  Recipient Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.recipientName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, recipientName: e.target.value }))
                  }
                  placeholder="e.g. Priya Sharma"
                  className={`w-full px-4 py-2.5 rounded-lg border text-sm text-[#1A1A1A] bg-[#FFFDF8] focus:outline-none focus:ring-1 focus:ring-[#8C6C38] ${
                    formErrors.recipientName ? 'border-red-500' : 'border-[#E8C98A]/40'
                  }`}
                />
                {formErrors.recipientName && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.recipientName}</p>
                )}
              </div>

              {/* Mobile Phone */}
              <div>
                <label className="block text-xs font-serif uppercase tracking-wider text-[#1A1A1A] font-semibold mb-1.5">
                  10-Digit Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-2.5 rounded-l-lg border border-r-0 border-[#E8C98A]/40 bg-[#FAF7F2] text-xs font-semibold text-[#666666]">
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        phone: e.target.value.replace(/[^0-9]/g, '').slice(0, 10),
                      }))
                    }
                    placeholder="9876543210"
                    className={`w-full px-4 py-2.5 rounded-r-lg border text-sm text-[#1A1A1A] bg-[#FFFDF8] focus:outline-none focus:ring-1 focus:ring-[#8C6C38] ${
                      formErrors.phone ? 'border-red-500' : 'border-[#E8C98A]/40'
                    }`}
                  />
                </div>
                {formErrors.phone && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.phone}</p>
                )}
              </div>

              {/* Address Line 1 */}
              <div>
                <label className="block text-xs font-serif uppercase tracking-wider text-[#1A1A1A] font-semibold mb-1.5">
                  Flat / House No., Building, Street <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.line1}
                  onChange={(e) => setFormData((prev) => ({ ...prev, line1: e.target.value }))}
                  placeholder="e.g. 42B, Shanti Niketan, Lake View Road"
                  className={`w-full px-4 py-2.5 rounded-lg border text-sm text-[#1A1A1A] bg-[#FFFDF8] focus:outline-none focus:ring-1 focus:ring-[#8C6C38] ${
                    formErrors.line1 ? 'border-red-500' : 'border-[#E8C98A]/40'
                  }`}
                />
                {formErrors.line1 && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.line1}</p>
                )}
              </div>

              {/* Address Line 2 */}
              <div>
                <label className="block text-xs font-serif uppercase tracking-wider text-[#1A1A1A] font-semibold mb-1.5">
                  Locality / Landmark <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.line2 || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, line2: e.target.value }))}
                  placeholder="e.g. Near City Mall"
                  className="w-full px-4 py-2.5 rounded-lg border border-[#E8C98A]/40 text-sm text-[#1A1A1A] bg-[#FFFDF8] focus:outline-none focus:ring-1 focus:ring-[#8C6C38]"
                />
                {formErrors.line2 && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.line2}</p>
                )}
              </div>

              {/* City, State, and PIN Code */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-serif uppercase tracking-wider text-[#1A1A1A] font-semibold mb-1.5">
                    City / Town <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder="e.g. Kolkata"
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm text-[#1A1A1A] bg-[#FFFDF8] focus:outline-none focus:ring-1 focus:ring-[#8C6C38] ${
                      formErrors.city ? 'border-red-500' : 'border-[#E8C98A]/40'
                    }`}
                  />
                  {formErrors.city && (
                    <p className="text-xs text-red-600 mt-1">{formErrors.city}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-serif uppercase tracking-wider text-[#1A1A1A] font-semibold mb-1.5">
                    State <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
                    placeholder="e.g. West Bengal"
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm text-[#1A1A1A] bg-[#FFFDF8] focus:outline-none focus:ring-1 focus:ring-[#8C6C38] ${
                      formErrors.state ? 'border-red-500' : 'border-[#E8C98A]/40'
                    }`}
                  />
                  {formErrors.state && (
                    <p className="text-xs text-red-600 mt-1">{formErrors.state}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-serif uppercase tracking-wider text-[#1A1A1A] font-semibold mb-1.5">
                    6-Digit PIN Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={formData.pincode}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        pincode: e.target.value.replace(/[^0-9]/g, '').slice(0, 6),
                      }))
                    }
                    placeholder="700029"
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm text-[#1A1A1A] bg-[#FFFDF8] focus:outline-none focus:ring-1 focus:ring-[#8C6C38] ${
                      formErrors.pincode ? 'border-red-500' : 'border-[#E8C98A]/40'
                    }`}
                  />
                  {formErrors.pincode && (
                    <p className="text-xs text-red-600 mt-1">{formErrors.pincode}</p>
                  )}
                </div>
              </div>

              {/* Set as Default checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))
                    }
                    className="w-4 h-4 rounded text-[#8C6C38] focus:ring-[#8C6C38] border-gray-300"
                  />
                  <span className="text-xs font-medium text-[#1A1A1A]">
                    Set as default delivery address for future orders
                  </span>
                </label>
              </div>

              {/* Form Actions */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#FAF7F2]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingAddress ? 'Update Address' : 'Save Address'}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {addressToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-red-200 p-6 my-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4 text-red-600">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 id="delete-dialog-title" className="font-serif text-lg font-bold text-[#1A1A1A] mb-2">
              Remove Saved Address?
            </h3>
            <p className="text-sm text-[#666666] leading-relaxed mb-6">
              Are you sure you want to delete the delivery address for{' '}
              <strong className="text-[#1A1A1A]">{addressToDelete.recipientName}</strong>?
              Past orders placed to this address will not be affected.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddressToDelete(null)}
                disabled={isDeleting}
                className="cursor-pointer"
              >
                Keep Address
              </Button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="inline-flex items-center justify-center px-6 py-3 rounded-brand bg-red-600 hover:bg-red-700 text-white text-xs md:text-sm font-medium tracking-wider uppercase transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Delete Address
              </button>
            </div>
          </div>
        </div>
      )}
    </StorefrontLayout>
  );
};
