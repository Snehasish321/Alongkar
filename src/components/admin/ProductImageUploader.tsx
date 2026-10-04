import React, { useState, useRef } from 'react';
import { useAuth } from '@clerk/react';
import {
  Upload,
  Loader,
  Alert,
  Refresh,
  Link as LinkIcon,
  Trash,
  TickCircle,
} from 'reicon-react';
import { getOptimizedImageUrl, IMAGE_PRESETS } from '../../lib/image';

interface ProductImageUploaderProps {
  label: string;
  sublabel?: string;
  value: string;
  onChange: (url: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export const ProductImageUploader: React.FC<ProductImageUploaderProps> = ({
  label,
  sublabel,
  value,
  onChange,
  error,
  disabled = false,
  required = false,
}) => {
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);

  // File Upload Logic
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setUploadError(null);

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      setUploadError(
        `Unsupported format (${file.type || 'unknown'}). Please upload a JPEG, PNG, WebP, or AVIF image.`
      );
      return;
    }

    // Validate size limit
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is ${MAX_SIZE_MB}MB.`
      );
      return;
    }

    setIsUploading(true);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication session missing. Please re-login as admin.');
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/uploads/product-image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Upload failed with status ${response.status}`);
      }

      if (!data.secure_url && !data.url) {
        throw new Error('Server returned invalid response without image URL.');
      }

      const secureUrl = data.secure_url || data.url;
      onChange(secureUrl);
      setUploadError(null);
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Failed to upload image to Cloudinary.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileUpload(droppedFile);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-2">
      {/* Header with Title & Mode Switcher */}
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-[#EDE4D5]/90 font-medium text-xs">
            {label} {required && <span className="text-red-400">*</span>}
          </label>
          {sublabel && <p className="text-[10px] text-[#EDE4D5]/50">{sublabel}</p>}
        </div>

        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          disabled={disabled || isUploading}
          className="text-[10px] text-[#D6B878]/80 hover:text-[#D6B878] flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
        >
          <LinkIcon className="w-3 h-3" />
          <span>{showUrlInput ? 'Switch to Upload' : 'Manual URL'}</span>
        </button>
      </div>

      {/* Hidden native file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={handleFileInputChange}
        disabled={disabled || isUploading}
      />

      {/* Main Upload / Preview Area */}
      {value && !showUrlInput ? (
        // Preview State with Actions
        <div className="relative rounded-xl bg-black/40 border border-[#D6B878]/30 overflow-hidden p-3 flex flex-col sm:flex-row items-center gap-4 group">
          <div className="relative w-24 h-24 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-black/80 shrink-0 border border-white/10 shadow-inner">
            <img
              src={getOptimizedImageUrl(value, IMAGE_PRESETS.THUMB_MD)}
              alt={label}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://placehold.co/120x120?text=Invalid+URL';
              }}
              loading="lazy"
              decoding="async"
            />
            {isUploading && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                <Loader className="w-5 h-5 text-[#D6B878] animate-spin" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[11px] text-emerald-400 font-medium">
              <TickCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Image Active</span>
            </div>
            <p className="text-[10px] font-mono text-white/50 truncate max-w-xs">{value}</p>
            <p className="text-[9px] text-[#D6B878]/70">
              Cloudinary CDN optimized & cached
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[#EDE4D5] text-[11px] font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Replace image"
            >
              {isUploading ? (
                <Loader className="w-3 h-3 animate-spin" />
              ) : (
                <Refresh className="w-3 h-3 text-[#D6B878]" />
              )}
              <span>Replace</span>
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled || isUploading}
              className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 transition cursor-pointer disabled:opacity-50"
              title="Remove image"
            >
              <Trash className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : showUrlInput ? (
        // Manual URL Entry Fallback
        <div className="space-y-2">
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || isUploading}
            placeholder="https://res.cloudinary.com/..."
            className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border ${
              error ? 'border-red-500' : 'border-white/15'
            } focus:outline-none focus:border-[#D6B878] text-white text-[11px] font-mono`}
          />
        </div>
      ) : (
        // Dropzone Upload Area
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!disabled && !isUploading) {
              fileInputRef.current?.click();
            }
          }}
          className={`relative rounded-xl border-2 border-dashed p-6 transition flex flex-col items-center justify-center text-center cursor-pointer ${
            isDragging
              ? 'border-[#D6B878] bg-[#D6B878]/10'
              : 'border-white/15 hover:border-[#D6B878]/50 bg-black/25 hover:bg-black/40'
          } ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader className="w-7 h-7 text-[#D6B878] animate-spin" />
              <p className="text-xs font-semibold text-white">
                Uploading to Alongkar Cloudinary...
              </p>
              <p className="text-[10px] text-white/50">
                Optimizing format and quality for high-jewellery showcase
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#D6B878] group-hover:scale-105 transition">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-white">
                  <span className="text-[#D6B878] font-semibold underline underline-offset-2">
                    Click to upload
                  </span>{' '}
                  or drag and drop
                </p>
                <p className="text-[10px] text-white/40 mt-0.5">
                  JPEG, PNG, WebP or AVIF (Up to 10MB)
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Displays */}
      {uploadError && (
        <div className="p-2.5 rounded-lg bg-red-950/70 border border-red-500/30 text-red-300 text-[11px] flex items-center gap-2">
          <Alert className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span className="flex-1">{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-[10px] text-red-400 hover:text-red-200 uppercase font-semibold ml-1 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && !uploadError && (
        <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
          <Alert className="w-3 h-3" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};
