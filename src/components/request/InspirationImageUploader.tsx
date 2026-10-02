import React, { useState, useRef } from 'react';
import { useAuth } from '@clerk/react';
import {
  Upload,
  Loader,
  Alert,
  Refresh,
  Trash,
  TickCircle,
  LinkSquare,
  Sparkles,
  Ban,
} from 'reicon-react';

interface InspirationImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  error?: string;
  disabled?: boolean;
  disabledMessage?: string;
  onUploadStateChange?: (isUploading: boolean) => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export const InspirationImageUploader: React.FC<InspirationImageUploaderProps> = ({
  value,
  onChange,
  error,
  disabled = false,
  disabledMessage,
  onUploadStateChange,
}) => {
  const { getToken, isSignedIn } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileInfo, setUploadedFileInfo] = useState<{
    name: string;
    sizeFormatted: string;
  } | null>(null);

  const setUploading = (uploading: boolean) => {
    setIsUploading(uploading);
    if (onUploadStateChange) {
      onUploadStateChange(uploading);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file || disabled) return;

    setUploadError(null);

    // 1. Client-side MIME type validation
    const fileType = file.type.toLowerCase();
    if (!ALLOWED_TYPES.includes(fileType)) {
      setUploadError(
        `Unsupported file type (${file.type || 'unknown'}). Please upload a JPG, PNG, WebP, or AVIF image.`
      );
      return;
    }

    // 2. Client-side Size Validation (Max 5MB)
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError(
        `Image is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is ${MAX_SIZE_MB}MB.`
      );
      return;
    }

    setUploading(true);

    try {
      let headers: Record<string, string> = {};

      if (isSignedIn) {
        const token = await getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/jewellery-inspiration', {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await response.json();

      if (response.status === 401) {
        throw new Error('Please sign in to upload your inspiration photo.');
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Upload failed with status ${response.status}`);
      }

      const secureUrl = data.secure_url || data.url;
      if (!secureUrl) {
        throw new Error('Server did not return a valid image URL.');
      }

      const sizeKb = file.size / 1024;
      const formattedSize =
        sizeKb > 1024
          ? `${(sizeKb / 1024).toFixed(1)} MB`
          : `${Math.round(sizeKb)} KB`;

      setUploadedFileInfo({
        name: file.name,
        sizeFormatted: formattedSize,
      });

      onChange(secureUrl);
      setUploadError(null);
    } catch (err: any) {
      console.error('Inspiration upload error:', err);
      setUploadError(err?.message || 'Failed to upload inspiration image. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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
    if (disabled || isUploading) return;
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleRemove = () => {
    onChange('');
    setUploadedFileInfo(null);
    setUploadError(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor="inspiration-image-file"
          className="block text-xs uppercase tracking-wider text-espresso font-semibold"
        >
          INSPIRATION IMAGE
        </label>
        {value && !isUploading && (
          <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
            <TickCircle size={12} /> Image Attached
          </span>
        )}
      </div>

      {/* Hidden native file input */}
      <input
        ref={fileInputRef}
        id="inspiration-image-file"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={handleFileInputChange}
        disabled={disabled || isUploading}
      />

      {/* Uploaded Image Preview State */}
      {value ? (
        <div className="relative rounded-brand bg-ivory-soft/60 border border-gold/30 p-3.5 flex flex-col sm:flex-row items-center gap-4 transition-all">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded bg-ivory border border-gold/30 overflow-hidden shrink-0 flex items-center justify-center shadow-inner">
            <img
              src={value}
              alt="Inspiration Preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://placehold.co/120x120?text=Preview';
              }}
            />
            {isUploading && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
                <Loader className="w-5 h-5 text-gold animate-spin" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-emerald-800 font-semibold">
              <TickCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Inspiration Photo Attached</span>
            </div>
            {uploadedFileInfo && (
              <p className="text-[11px] text-gray-600 truncate">
                {uploadedFileInfo.name} ({uploadedFileInfo.sizeFormatted})
              </p>
            )}
            <div className="flex items-center justify-center sm:justify-start gap-2 pt-0.5">
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-gold hover:underline inline-flex items-center gap-1 font-medium"
              >
                <span>View full size</span>
                <LinkSquare size={10} />
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className="px-3 py-2 rounded-brand bg-ivory hover:bg-ivory-pearl text-espresso text-xs font-medium transition border border-gold/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Replace image"
            >
              {isUploading ? (
                <Loader className="w-3.5 h-3.5 animate-spin text-gold" />
              ) : (
                <Refresh className="w-3.5 h-3.5 text-gold" />
              )}
              <span>Replace</span>
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={isUploading}
              className="p-2 rounded-brand bg-red-50 hover:bg-red-100 text-burgundy transition border border-burgundy/20 cursor-pointer disabled:opacity-50"
              title="Remove image"
              aria-label="Remove image"
            >
              <Trash className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Empty / Dropzone State */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!disabled && !isUploading) {
              fileInputRef.current?.click();
            }
          }}
          className={`relative rounded-brand border-2 border-dashed p-6 sm:p-7 transition flex flex-col items-center justify-center text-center ${
            disabled
              ? 'bg-neutral-100/60 border-neutral-300 text-neutral-400 cursor-not-allowed opacity-65 select-none'
              : isDragging
              ? 'border-gold bg-gold/10 cursor-copy'
              : error
              ? 'border-burgundy/60 bg-red-50/30 hover:border-burgundy cursor-pointer'
              : 'border-gold/30 hover:border-gold/70 bg-ivory hover:bg-ivory-pearl cursor-pointer'
          }`}
          aria-disabled={disabled}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader className="w-7 h-7 text-gold animate-spin" />
              <p className="text-xs font-semibold text-espresso">
                Uploading to Alongkar Cloudinary CDN...
              </p>
              <p className="text-[11px] text-gray-500">
                Optimizing image quality and dimensions for atelier review
              </p>
            </div>
          ) : disabled ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="w-9 h-9 rounded-full bg-neutral-200/70 flex items-center justify-center text-neutral-400">
                <Ban className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-neutral-500">
                Image upload is disabled
              </p>
              {disabledMessage && (
                <p className="text-[11px] text-neutral-400 max-w-sm">
                  {disabledMessage}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5">
              <div className="w-11 h-11 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold transition-transform hover:scale-105">
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-espresso">
                  <span className="text-gold font-bold underline underline-offset-2">
                    Click to browse
                  </span>{' '}
                  or drag and drop your inspiration photo
                </p>
                <p className="text-[11px] text-gray-500">
                  Supports JPG, PNG, WebP or AVIF (Up to 5MB)
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gold/10 text-[10px] text-gold font-semibold uppercase tracking-wider">
                <Sparkles size={10} />
                <span>Pinterest / Instagram / Screenshot photos</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Error Display */}
      {uploadError && (
        <div className="p-3 rounded-brand bg-red-50 border border-burgundy/30 text-burgundy text-xs flex items-center justify-between gap-2 mt-1">
          <div className="flex items-center gap-1.5 flex-1">
            <Alert className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-[10px] text-burgundy hover:underline uppercase font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Validation Error (when not uploading error) */}
      {error && !uploadError && (
        <p className="text-xs text-burgundy flex items-center gap-1 font-medium mt-1">
          <Alert size={13} className="shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};
