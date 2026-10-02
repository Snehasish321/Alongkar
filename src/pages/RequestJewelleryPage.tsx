import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, SignInButton } from '@clerk/react';
import {
  Sparkles,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Search,
  ShieldCheck,
  Clock,
  Gem,
  Link2,
  X,
} from 'lucide-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import { SectionHeading } from '../components/ui/SectionHeading';
import { Button } from '../components/ui/Button';
import { InspirationImageUploader } from '../components/request/InspirationImageUploader';

const JEWELLERY_TYPES = [
  'Jhumka',
  'Earrings',
  'Necklace',
  'Pendant',
  'Ring',
  'Bracelet',
  'Bangle',
  'Anklet',
  'Nose Pin',
  'Other',
];

interface FormState {
  jewelleryType: string;
  description: string;
  inspirationImageUrl: string;
  inspirationLink: string;
  budget: string;
  quantity: number;
  phone: string;
  additionalRequirements: string;
}

interface FormErrors {
  jewelleryType?: string;
  description?: string;
  inspiration?: string;
  inspirationImageUrl?: string;
  inspirationLink?: string;
  quantity?: string;
  phone?: string;
  budget?: string;
  general?: string;
}

export const RequestJewelleryPage: React.FC = () => {
  const { isSignedIn } = useUser();
  const navigate = useNavigate();

  const [formData, setFormData] = useState<FormState>({
    jewelleryType: 'Jhumka',
    description: '',
    inspirationImageUrl: '',
    inspirationLink: '',
    budget: '',
    quantity: 1,
    phone: '',
    additionalRequirements: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<{
    id: string;
    requestNumber: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [authError, setAuthError] = useState(false);

  const hasImage = Boolean(formData.inspirationImageUrl.trim());
  const hasLink = Boolean(formData.inspirationLink.trim());

  // Field validation
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.jewelleryType.trim()) {
      newErrors.jewelleryType = 'Please select a jewellery type.';
    }

    if (!formData.description.trim()) {
      newErrors.description = "Please describe the design you're looking for.";
    }

    // Inspiration validation: mutually exclusive (Image OR Link required)
    if (isImageUploading) {
      newErrors.inspiration = 'Please wait for your inspiration photo to finish uploading.';
    } else if (!hasImage && !hasLink) {
      newErrors.inspiration = 'Please provide an inspiration image or an inspiration link.';
    } else if (hasImage && hasLink) {
      newErrors.inspiration = 'Please provide only one inspiration reference: an image or a link.';
    } else if (hasImage) {
      try {
        const parsed = new URL(formData.inspirationImageUrl.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          newErrors.inspirationImageUrl = 'Image URL must begin with http:// or https://';
        }
      } catch {
        newErrors.inspirationImageUrl = 'Invalid image URL received.';
      }
    } else if (hasLink) {
      try {
        const parsed = new URL(formData.inspirationLink.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          newErrors.inspirationLink = 'Please enter a valid URL starting with http:// or https://';
        }
      } catch {
        newErrors.inspirationLink = 'Please enter a valid website link (e.g. https://www.pinterest.com/pin/example/)';
      }
    }

    if (
      typeof formData.quantity !== 'number' ||
      !Number.isInteger(formData.quantity) ||
      formData.quantity < 1
    ) {
      newErrors.quantity = 'Quantity must be at least 1.';
    }

    const cleanedPhone = formData.phone.replace(/[\s\-()]/g, '');
    if (!cleanedPhone) {
      newErrors.phone = 'Phone number is required.';
    } else if (!/^(?:\+?91|0)?[6-9]\d{9}$/.test(cleanedPhone)) {
      newErrors.phone = 'Please enter a valid 10-digit mobile number.';
    }

    if (formData.budget.trim()) {
      const budgetNum = parseFloat(formData.budget.replace(/[^0-9.]/g, ''));
      if (isNaN(budgetNum) || budgetNum < 0) {
        newErrors.budget = 'Please enter a valid approximate budget amount.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFieldChange = (field: keyof FormState, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const updated = { ...prev, [field]: undefined, general: undefined };
      if (field === 'inspirationImageUrl' || field === 'inspirationLink') {
        updated.inspiration = undefined;
        updated.inspirationImageUrl = undefined;
        updated.inspirationLink = undefined;
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    setAuthError(false);

    try {
      // Parse budget if provided
      let budgetVal: number | string | null = null;
      if (formData.budget.trim()) {
        const cleaned = formData.budget.trim();
        budgetVal = cleaned;
      }

      const payload = {
        jewelleryType: formData.jewelleryType.trim(),
        description: formData.description.trim(),
        inspirationImageUrl: hasImage ? formData.inspirationImageUrl.trim() : '',
        inspirationLink: hasLink ? formData.inspirationLink.trim() : '',
        quantity: formData.quantity,
        phone: formData.phone.trim(),
        budget: budgetVal,
        additionalRequirements: formData.additionalRequirements.trim() || null,
      };

      const response = await fetch('/api/jewellery-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.status === 401) {
        setAuthError(true);
        setErrors({
          general: 'Please sign in to your Alongkar account to submit your jewellery request.',
        });
        return;
      }

      if (!response.ok || !data.success) {
        setErrors({
          general: data.error || 'Failed to submit request. Please check your information.',
        });
        return;
      }

      // Success
      setSubmittedRequest({
        id: data.request?.id || '',
        requestNumber: data.request?.requestNumber || '',
      });
    } catch (err: any) {
      console.error('Request Jewellery submission error:', err);
      setErrors({
        general: 'Unable to connect to the server. Please check your network connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyRequestNumber = () => {
    if (submittedRequest?.requestNumber) {
      navigator.clipboard.writeText(submittedRequest.requestNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleResetForm = () => {
    setSubmittedRequest(null);
    setFormData({
      jewelleryType: 'Jhumka',
      description: '',
      inspirationImageUrl: '',
      inspirationLink: '',
      budget: '',
      quantity: 1,
      phone: '',
      additionalRequirements: '',
    });
    setErrors({});
  };

  return (
    <StorefrontLayout>
      <main className="py-10 sm:py-16 bg-ivory min-h-[80vh]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Section */}
          <SectionHeading
            title="Request For Jewellery"
            subtitle="Custom Sourcing Atelier"
            className="mb-8"
          />

          {/* Success State */}
          {submittedRequest ? (
            <div className="bg-ivory-pearl rounded-brand border border-gold/30 shadow-elevated p-6 sm:p-10 max-w-2xl mx-auto text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-[#E8C98A]/20 border border-[#E8C98A]/40 flex items-center justify-center mx-auto text-gold">
                <CheckCircle2 size={36} className="text-[#8C6C38]" />
              </div>

              <div className="space-y-2">
                <h3 className="font-serif text-2xl font-bold text-espresso">
                  Request Submitted Successfully!
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                  We&apos;ve received your jewellery sourcing request. Our atelier team will review the
                  design craftsmanship and get back to you if we are able to source it.
                </p>
              </div>

              {/* Request Number Box */}
              <div className="p-4 bg-ivory rounded-brand border border-gold/25 inline-flex flex-col items-center gap-2 max-w-sm w-full mx-auto">
                <span className="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold">
                  Your Request ID
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base sm:text-lg font-bold text-espresso tracking-wide">
                    {submittedRequest.requestNumber}
                  </span>
                  <button
                    onClick={handleCopyRequestNumber}
                    className="p-1.5 text-gold hover:text-espresso transition-colors rounded hover:bg-gold/10 cursor-pointer"
                    title="Copy Request Number"
                    aria-label="Copy Request Number"
                  >
                    {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  </button>
                </div>
                {copied && (
                  <span className="text-[10px] text-emerald-600 font-medium">Copied to clipboard</span>
                )}
              </div>

              <div className="p-4 bg-ivory-soft/50 rounded-brand border border-gold/15 text-left text-xs text-gray-600 space-y-1.5">
                <p className="font-semibold text-espresso flex items-center gap-1.5">
                  <Clock size={13} className="text-gold" />
                  <span>What happens next?</span>
                </p>
                <ul className="list-disc list-inside space-y-1 text-gray-500 text-[11px] pl-1">
                  <li>Our karigars review your requested design for craftsmanship feasibility.</li>
                  <li>Submitting a request is free and does not commit you to an order.</li>
                  <li>We will contact you via WhatsApp / Phone with a price quote if it can be sourced.</li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <Button
                  variant="gold"
                  size="md"
                  onClick={() => navigate('/shop')}
                  className="w-full sm:w-auto gap-2"
                >
                  <Search size={14} />
                  <span>CONTINUE SHOPPING</span>
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleResetForm}
                  className="w-full sm:w-auto gap-2"
                >
                  <RefreshCw size={14} />
                  <span>SUBMIT ANOTHER REQUEST</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Informative Intro Banner */}
              <div className="bg-gradient-to-br from-[#32060E] to-[#200207] text-[#F8F1E3] rounded-brand p-6 sm:p-8 border border-[#E8C98A]/25 shadow-soft relative overflow-hidden">
                <div className="relative z-10 space-y-3 max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 border border-[#E8C98A]/30 text-[#E8C98A] text-[11px] font-semibold uppercase tracking-wider">
                    <Sparkles size={12} />
                    <span>Bespoke Sourcing Service</span>
                  </div>
                  <h3 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#FFE3C7]">
                    Can&apos;t find your perfect jewellery?
                  </h3>
                  <p className="text-xs sm:text-sm text-[#F8F1E3]/85 leading-relaxed font-normal">
                    Send us an inspiration image and your specifications. Our Kolkata atelier team will
                    review the craftsmanship and try to source a similar high-finish city-gold piece for you.
                  </p>
                </div>

                {/* Feature Pills */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-white/10 mt-6 text-xs text-[#F8F1E3]/90">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#E8C98A]/20 flex items-center justify-center text-[#E8C98A] shrink-0">
                      <Gem size={12} />
                    </div>
                    <span>No Obligation Sourcing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#E8C98A]/20 flex items-center justify-center text-[#E8C98A] shrink-0">
                      <ShieldCheck size={12} />
                    </div>
                    <span>Authentic Micron City-Gold</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#E8C98A]/20 flex items-center justify-center text-[#E8C98A] shrink-0">
                      <Clock size={12} />
                    </div>
                    <span>Direct Concierge Updates</span>
                  </div>
                </div>
              </div>

              {/* General Error Banner */}
              {errors.general && (
                <div className="p-4 rounded-brand bg-red-50 border border-burgundy/30 text-burgundy flex items-start gap-3">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <p className="font-semibold">{errors.general}</p>
                    {authError && (
                      <div className="mt-2">
                        <SignInButton mode="modal">
                          <button
                            type="button"
                            className="px-3.5 py-1.5 bg-espresso text-ivory text-xs font-semibold rounded-brand hover:bg-espresso-charcoal transition-colors cursor-pointer"
                          >
                            Sign In to Alongkar
                          </button>
                        </SignInButton>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Request Form */}
              <div className="bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft p-6 sm:p-10">
                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  {/* Row 1: Jewellery Type & Quantity */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="sm:col-span-2 space-y-2">
                      <label
                        htmlFor="jewellery-type"
                        className="block text-xs uppercase tracking-wider text-espresso font-semibold"
                      >
                        Jewellery Type <span className="text-burgundy">*</span>
                      </label>
                      <select
                        id="jewellery-type"
                        value={formData.jewelleryType}
                        onChange={(e) => handleFieldChange('jewelleryType', e.target.value)}
                        disabled={isSubmitting}
                        className={`w-full bg-ivory text-xs text-espresso px-3.5 py-3 rounded-brand border transition-colors focus:outline-none focus:ring-2 cursor-pointer ${
                          errors.jewelleryType
                            ? 'border-burgundy focus:ring-burgundy/20'
                            : 'border-gold/30 focus:border-gold focus:ring-gold/30'
                        }`}
                      >
                        {JEWELLERY_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      {errors.jewelleryType && (
                        <p className="text-xs text-burgundy flex items-center gap-1 font-medium">
                          <AlertCircle size={13} /> {errors.jewelleryType}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="quantity"
                        className="block text-xs uppercase tracking-wider text-espresso font-semibold"
                      >
                        Quantity <span className="text-burgundy">*</span>
                      </label>
                      <input
                        id="quantity"
                        type="number"
                        min="1"
                        step="1"
                        required
                        disabled={isSubmitting}
                        value={formData.quantity}
                        onChange={(e) =>
                          handleFieldChange('quantity', parseInt(e.target.value, 10) || 1)
                        }
                        className={`w-full bg-ivory text-xs text-espresso px-3.5 py-3 rounded-brand border transition-colors focus:outline-none focus:ring-2 ${
                          errors.quantity
                            ? 'border-burgundy focus:ring-burgundy/20'
                            : 'border-gold/30 focus:border-gold focus:ring-gold/30'
                        }`}
                      />
                      {errors.quantity && (
                        <p className="text-xs text-burgundy flex items-center gap-1 font-medium">
                          <AlertCircle size={13} /> {errors.quantity}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Inspiration Reference Section (Mutually Exclusive: Link OR Image) */}
                  <div className="space-y-4 pt-1">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="block text-xs uppercase tracking-wider text-espresso font-semibold">
                          Inspiration Reference <span className="text-burgundy">*</span>
                        </span>
                        <span className="text-[11px] text-gray-500 font-normal">
                          Provide a link <span className="font-semibold text-espresso">OR</span> an image
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Provide either an inspiration link or an inspiration image.
                      </p>
                    </div>

                    {/* General Inspiration Error */}
                    {errors.inspiration && (
                      <div className="p-3 rounded-brand bg-red-50 border border-burgundy/30 text-burgundy text-xs flex items-center gap-2">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{errors.inspiration}</span>
                      </div>
                    )}

                    {/* 1. Inspiration Link Input */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="inspiration-link"
                          className="block text-xs uppercase tracking-wider text-espresso font-semibold"
                        >
                          INSPIRATION LINK
                        </label>
                        {hasLink && !hasImage && !errors.inspirationLink && (
                          <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                            <CheckCircle2 size={12} /> Link Attached
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                          <Link2 size={15} />
                        </div>
                        <input
                          id="inspiration-link"
                          type="url"
                          disabled={hasImage || isSubmitting}
                          value={formData.inspirationLink}
                          onChange={(e) => {
                            handleFieldChange('inspirationLink', e.target.value);
                            if (errors.inspiration) {
                              setErrors((prev) => ({ ...prev, inspiration: undefined }));
                            }
                          }}
                          placeholder="Paste a link to your jewellery inspiration (Pinterest, Instagram, website, etc.)"
                          className={`w-full bg-ivory text-xs text-espresso pl-10 pr-10 py-3 rounded-brand border transition-colors focus:outline-none focus:ring-2 ${
                            hasImage
                              ? 'bg-neutral-100/60 text-neutral-400 border-neutral-300 cursor-not-allowed opacity-65 select-none'
                              : errors.inspirationLink
                              ? 'border-burgundy focus:ring-burgundy/20'
                              : 'border-gold/30 focus:border-gold focus:ring-gold/30'
                          }`}
                          aria-disabled={hasImage || isSubmitting}
                        />
                        {formData.inspirationLink && !hasImage && (
                          <button
                            type="button"
                            onClick={() => handleFieldChange('inspirationLink', '')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-espresso transition cursor-pointer"
                            title="Clear link"
                            aria-label="Clear inspiration link"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>

                      {hasImage ? (
                        <p className="text-[11px] text-neutral-500 italic">
                          An inspiration image has been uploaded. Remove it to use an inspiration link instead.
                        </p>
                      ) : errors.inspirationLink ? (
                        <p className="text-xs text-burgundy flex items-center gap-1 font-medium">
                          <AlertCircle size={13} className="shrink-0" />
                          <span>{errors.inspirationLink}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-500">
                          Paste a link to your jewellery inspiration (Pinterest, Instagram, website, etc.)
                        </p>
                      )}
                    </div>

                    {/* 2. OR Divider */}
                    <div className="relative flex items-center justify-center my-3">
                      <div className="border-t border-gold/25 w-full"></div>
                      <span className="bg-ivory-pearl px-3.5 py-0.5 rounded-full border border-gold/30 text-[10px] font-bold text-gold uppercase tracking-widest relative shadow-xs">
                        OR
                      </span>
                    </div>

                    {/* 3. Inspiration Image Uploader */}
                    <div className="space-y-1">
                      <InspirationImageUploader
                        value={formData.inspirationImageUrl}
                        onChange={(val) => {
                          handleFieldChange('inspirationImageUrl', val);
                          if (errors.inspiration) {
                            setErrors((prev) => ({ ...prev, inspiration: undefined }));
                          }
                        }}
                        error={errors.inspirationImageUrl}
                        disabled={hasLink || isSubmitting}
                        disabledMessage="An inspiration link has been added. Remove the link to upload an inspiration image instead."
                        onUploadStateChange={(uploading) => setIsImageUploading(uploading)}
                      />
                    </div>
                  </div>

                  {/* Row 3: Description */}
                  <div className="space-y-2">
                    <label
                      htmlFor="description"
                      className="block text-xs uppercase tracking-wider text-espresso font-semibold"
                    >
                      Tell us what you&apos;re looking for <span className="text-burgundy">*</span>
                    </label>
                    <textarea
                      id="description"
                      rows={4}
                      required
                      disabled={isSubmitting}
                      value={formData.description}
                      onChange={(e) => handleFieldChange('description', e.target.value)}
                      placeholder="Explain the requested design, size, style, colour, finish, stones, or other important requirements..."
                      className={`w-full bg-ivory text-xs text-espresso p-3.5 rounded-brand border transition-colors focus:outline-none focus:ring-2 ${
                        errors.description
                          ? 'border-burgundy focus:ring-burgundy/20'
                          : 'border-gold/30 focus:border-gold focus:ring-gold/30'
                      }`}
                    />
                    {errors.description && (
                      <p className="text-xs text-burgundy flex items-center gap-1 font-medium">
                        <AlertCircle size={13} /> {errors.description}
                      </p>
                    )}
                  </div>

                  {/* Row 4: Phone & Approximate Budget */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label
                        htmlFor="phone"
                        className="block text-xs uppercase tracking-wider text-espresso font-semibold"
                      >
                        Phone Number <span className="text-burgundy">*</span>
                      </label>
                      <input
                        id="phone"
                        type="tel"
                        required
                        disabled={isSubmitting}
                        value={formData.phone}
                        onChange={(e) => handleFieldChange('phone', e.target.value)}
                        placeholder="e.g. 98765 43210"
                        className={`w-full bg-ivory text-xs text-espresso px-3.5 py-3 rounded-brand border transition-colors focus:outline-none focus:ring-2 ${
                          errors.phone
                            ? 'border-burgundy focus:ring-burgundy/20'
                            : 'border-gold/30 focus:border-gold focus:ring-gold/30'
                        }`}
                      />
                      <p className="text-[11px] text-gray-500">
                        We will contact you with sourcing details and pricing.
                      </p>
                      {errors.phone && (
                        <p className="text-xs text-burgundy flex items-center gap-1 font-medium">
                          <AlertCircle size={13} /> {errors.phone}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="budget"
                        className="block text-xs uppercase tracking-wider text-espresso font-semibold"
                      >
                        Approximate Budget (Optional)
                      </label>
                      <input
                        id="budget"
                        type="text"
                        disabled={isSubmitting}
                        value={formData.budget}
                        onChange={(e) => handleFieldChange('budget', e.target.value)}
                        placeholder="e.g. ₹2,000 or 1500-2500"
                        className={`w-full bg-ivory text-xs text-espresso px-3.5 py-3 rounded-brand border transition-colors focus:outline-none focus:ring-2 ${
                          errors.budget
                            ? 'border-burgundy focus:ring-burgundy/20'
                            : 'border-gold/30 focus:border-gold focus:ring-gold/30'
                        }`}
                      />
                      <p className="text-[11px] text-gray-500">
                        Leave blank if you are unsure or flexible.
                      </p>
                      {errors.budget && (
                        <p className="text-xs text-burgundy flex items-center gap-1 font-medium">
                          <AlertCircle size={13} /> {errors.budget}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Row 5: Additional Requirements */}
                  <div className="space-y-2">
                    <label
                      htmlFor="additional-requirements"
                      className="block text-xs uppercase tracking-wider text-espresso font-semibold"
                    >
                      Anything else? (Optional)
                    </label>
                    <textarea
                      id="additional-requirements"
                      rows={2}
                      disabled={isSubmitting}
                      value={formData.additionalRequirements}
                      onChange={(e) => handleFieldChange('additionalRequirements', e.target.value)}
                      placeholder="Special occasion date, metal polish preference, necklace length, bangle size, etc."
                      className="w-full bg-ivory text-xs text-espresso p-3.5 rounded-brand border border-gold/30 focus:border-gold focus:ring-2 focus:ring-gold/30 focus:outline-none"
                    />
                  </div>

                  {/* Authentication Notice if not signed in */}
                  {!isSignedIn && (
                    <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-brand text-xs text-amber-900 flex items-center justify-between gap-4">
                      <span>
                        You are currently browsing as a guest. You will be prompted to sign in when submitting.
                      </span>
                      <SignInButton mode="modal">
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-[#32060E] text-[#F8F1E3] font-semibold text-[11px] uppercase tracking-wider rounded shrink-0 hover:bg-[#200207] transition-colors cursor-pointer"
                        >
                          Sign In Now
                        </button>
                      </SignInButton>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="gold"
                      size="lg"
                      disabled={isSubmitting || isImageUploading}
                      className="w-full sm:w-auto gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>SUBMITTING REQUEST...</span>
                        </>
                      ) : isImageUploading ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>UPLOADING IMAGE...</span>
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          <span>SUBMIT JEWELLERY REQUEST</span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
    </StorefrontLayout>
  );
};
