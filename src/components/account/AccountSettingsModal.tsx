import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useUser, useSession } from '@clerk/react';
import {
  User,
  X,
  Mail,
  Lock,
  Globe,
  CheckCircle2,
  Edit2,
  Check,
  Loader2,
  AlertCircle,
  Camera,
  Upload,
  Trash2,
  Plus,
  Star,
  RefreshCw,
  MoreHorizontal,
  ShieldCheck,
  Monitor,
  AlertTriangle,
} from 'lucide-react';

/**
 * Inspect magic bytes of the file to verify real image MIME signature.
 * Supports:
 * - JPEG: starts with FF D8 FF
 * - PNG: starts with 89 50 4E 47
 * - WebP: starts with 52 49 46 46 (RIFF), bytes 8-11 are 57 45 42 50 (WEBP)
 */
async function validateImageFileSignature(file: File): Promise<boolean> {
  try {
    const buffer = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return true;
    }

    // PNG: 89 50 4E 47
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return true;
    }

    // WebP: RIFF .... WEBP
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Fallback detector for current client environment.
 */
function getClientBrowserAndDevice(): { deviceLabel: string; browserLabel: string } {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { deviceLabel: 'Current device', browserLabel: 'Web browser' };
  }

  const ua = navigator.userAgent;
  let deviceLabel = 'Desktop device';
  if (/iPad|iPhone|iPod/.test(ua)) {
    deviceLabel = 'iOS device';
  } else if (/Android/.test(ua)) {
    deviceLabel = 'Android device';
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    deviceLabel = 'macOS device';
  } else if (/Windows/.test(ua)) {
    deviceLabel = 'Windows PC';
  } else if (/Linux/.test(ua)) {
    deviceLabel = 'Linux device';
  }

  let browserLabel = 'Browser';
  if (/Edg\//.test(ua)) {
    browserLabel = 'Microsoft Edge';
  } else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) {
    browserLabel = 'Google Chrome';
  } else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) {
    browserLabel = 'Apple Safari';
  } else if (/Firefox\//.test(ua)) {
    browserLabel = 'Mozilla Firefox';
  }

  return { deviceLabel, browserLabel };
}

export interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useUser();
  const { session } = useSession();

  const modalRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Profile editing state
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const firstNameInputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  // Avatar management state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAvatarSubmitting, setIsAvatarSubmitting] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Sync ref and cleanup object URL on unmount
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  // Email management state
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [emailStep, setEmailStep] = useState<'input' | 'verify'>('input');
  const [newEmail, setNewEmail] = useState('');
  const [newEmailError, setNewEmailError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationCodeError, setVerificationCodeError] = useState<string | null>(null);
  const [pendingVerificationEmailId, setPendingVerificationEmailId] = useState<string | null>(null);
  const [pendingVerificationEmailAddress, setPendingVerificationEmailAddress] = useState('');
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false);
  const [emailActionError, setEmailActionError] = useState<string | null>(null);
  const [emailActionSuccess, setEmailActionSuccess] = useState<string | null>(null);
  const [deletingEmailId, setDeletingEmailId] = useState<string | null>(null);
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [openEmailMenuId, setOpenEmailMenuId] = useState<string | null>(null);

  const newEmailInputRef = useRef<HTMLInputElement>(null);
  const verificationCodeInputRef = useRef<HTMLInputElement>(null);
  const addEmailButtonRef = useRef<HTMLButtonElement>(null);

  // Google OAuth linking state
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isDisconnectingGoogle, setIsDisconnectingGoogle] = useState(false);
  const [isConfirmingDisconnectGoogle, setIsConfirmingDisconnectGoogle] = useState(false);
  const [googleActionError, setGoogleActionError] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const err = new URLSearchParams(window.location.search).get('oauth_error');
    return err ? decodeURIComponent(err) || 'Failed to connect Google account.' : null;
  });
  const [googleActionSuccess, setGoogleActionSuccess] = useState<string | null>(null);

  // Active Sessions / Devices State
  const [sessions, setSessions] = useState<Array<{
    id: string;
    isCurrent: boolean;
    deviceLabel: string;
    browserLabel: string;
    lastActiveText: string;
    status: string;
  }>>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Account Deletion State
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Countdown timer for resend verification cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Fetch active sessions from Clerk or browser fallback
  useEffect(() => {
    if (!isOpen || !user) return;

    let isMounted = true;
    const fetchSessionData = async () => {
      setIsLoadingSessions(true);
      const { deviceLabel: fallbackDevice, browserLabel: fallbackBrowser } = getClientBrowserAndDevice();

      try {
        if (typeof user.getSessions === 'function') {
          const clerkSessions = await user.getSessions();
          if (isMounted && clerkSessions && clerkSessions.length > 0) {
            const parsed = clerkSessions.map((s) => {
              const isCurrent = Boolean(session && s.id === session.id);
              const activity = s.latestActivity;
              const deviceLabel = activity?.deviceType
                ? `${activity.deviceType.charAt(0).toUpperCase() + activity.deviceType.slice(1)} (${fallbackDevice})`
                : isCurrent
                  ? fallbackDevice
                  : 'Authenticated device';

              const browserLabel = activity?.browserName
                ? `${activity.browserName}${activity.browserVersion ? ` ${activity.browserVersion.split('.')[0]}` : ''}`
                : isCurrent
                  ? fallbackBrowser
                  : 'Web browser';

              const lastActiveDate = s.lastActiveAt ? new Date(s.lastActiveAt) : null;
              const lastActiveText = isCurrent
                ? 'Active now'
                : lastActiveDate
                  ? `Last active ${lastActiveDate.toLocaleDateString()}`
                  : 'Recently active';

              return {
                id: s.id,
                isCurrent,
                deviceLabel,
                browserLabel,
                lastActiveText,
                status: s.status || 'active',
              };
            });

            parsed.sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));
            setSessions(parsed);
            setIsLoadingSessions(false);
            return;
          }
        }
      } catch {
        // Fall back gracefully to current session
      }

      if (isMounted) {
        setSessions([
          {
            id: session?.id || 'current-session',
            isCurrent: true,
            deviceLabel: fallbackDevice,
            browserLabel: fallbackBrowser,
            lastActiveText: 'Active now',
            status: session?.status || 'active',
          },
        ]);
        setIsLoadingSessions(false);
      }
    };

    void fetchSessionData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, user, session]);

  // Handlers for closing with clean transient state reset
  const handleModalClose = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setAvatarError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsEditing(false);
    setFieldErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);

    // Reset email management state
    setIsAddingEmail(false);
    setEmailStep('input');
    setNewEmail('');
    setNewEmailError(null);
    setVerificationCode('');
    setVerificationCodeError(null);
    setPendingVerificationEmailId(null);
    setPendingVerificationEmailAddress('');
    setIsEmailSubmitting(false);
    setEmailActionError(null);
    setEmailActionSuccess(null);
    setDeletingEmailId(null);
    setSettingPrimaryId(null);
    setResendCooldown(0);
    setOpenEmailMenuId(null);

    // Reset Google OAuth state
    setIsConnectingGoogle(false);
    setIsDisconnectingGoogle(false);
    setIsConfirmingDisconnectGoogle(false);
    setGoogleActionError(null);
    setGoogleActionSuccess(null);

    // Reset Security state
    setIsConfirmingDelete(false);

    onClose();
  }, [onClose]);

  // Focus Management & Focus Trap
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          handleModalClose();
          return;
        }

        if (event.key === 'Tab' && modalRef.current) {
          const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );

          if (focusableElements.length === 0) return;

          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (event.shiftKey) {
            if (document.activeElement === firstElement) {
              event.preventDefault();
              lastElement.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              event.preventDefault();
              firstElement.focus();
            }
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        clearTimeout(timer);
        document.removeEventListener('keydown', handleKeyDown);
        if (previousActiveElementRef.current) {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [isOpen, handleModalClose]);

  // Body Scroll Lock
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // OAuth return reconciliation effect
  useEffect(() => {
    if (!isOpen || !user) return;

    const params = new URLSearchParams(window.location.search);
    const oauthLinked = params.get('oauth_linked');
    const oauthError = params.get('oauth_error');

    if (oauthLinked || oauthError) {
      if (oauthLinked === 'google') {
        const verifyConnection = async () => {
          try {
            if (typeof user.reload === 'function') {
              await user.reload();
            }
            const isConnected = (user.externalAccounts || []).some(
              (acc) => acc.provider === 'google' || acc.verification?.strategy?.includes('google')
            );
            if (isConnected) {
              setGoogleActionSuccess('Google account successfully connected for Single Sign-On.');
              setGoogleActionError(null);
            } else {
              setGoogleActionError('Google connection was not completed or was cancelled.');
              setGoogleActionSuccess(null);
            }
          } catch {
            setGoogleActionError('Failed to refresh account status after Google connection.');
          }
        };
        void verifyConnection();
      } else if (oauthError) {
        queueMicrotask(() => {
          setGoogleActionError(decodeURIComponent(oauthError) || 'Failed to connect Google account.');
          setGoogleActionSuccess(null);
        });
      }

      // Clean up temporary query parameters without stripping unrelated query parameters or breaking routes
      params.delete('oauth_linked');
      params.delete('oauth_error');
      const remainingQuery = params.toString();
      const cleanUrl =
        window.location.pathname + (remainingQuery ? `?${remainingQuery}` : '') + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const displayName = user.fullName || user.firstName || 'Alongkar Client';
  const avatarUrl = user.imageUrl;

  // External Connected Accounts (e.g. Google OAuth)
  const connectedAccounts = user.externalAccounts || [];
  const googleAccount = connectedAccounts.find(
    (acc) => acc.provider === 'google' || acc.verification?.strategy?.includes('google')
  );

  // Authentication Safeguard: determine if Google can be safely unlinked
  const hasPassword = Boolean(user.passwordEnabled);
  const hasAlternativeExternalAccount = connectedAccounts.filter(
    (acc) => acc.id !== googleAccount?.id
  ).length > 0;
  const hasPasskey = ((user as { passkeys?: Array<unknown> }).passkeys || []).length > 0;
  const canSafelyDisconnect = hasPassword || hasAlternativeExternalAccount || hasPasskey;

  // Check if inputs have changed from Clerk's current user record
  const hasChanges =
    firstName.trim() !== (user.firstName || '').trim() ||
    lastName.trim() !== (user.lastName || '').trim();

  const handleStartEditing = () => {
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setFieldErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsEditing(true);
    setTimeout(() => {
      firstNameInputRef.current?.focus();
    }, 50);
  };

  const handleCancelEditing = () => {
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setFieldErrors({});
    setErrorMessage(null);
    setIsEditing(false);
    setTimeout(() => {
      editButtonRef.current?.focus();
    }, 50);
  };

  const validateInputs = (): boolean => {
    const errors: { firstName?: string; lastName?: string } = {};
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedFirst) {
      errors.firstName = 'First name is required.';
    } else if (trimmedFirst.length > 50) {
      errors.firstName = 'First name cannot exceed 50 characters.';
    }

    if (trimmedLast.length > 50) {
      errors.lastName = 'Last name cannot exceed 50 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validateInputs()) {
      return;
    }

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (
      trimmedFirst === (user.firstName || '').trim() &&
      trimmedLast === (user.lastName || '').trim()
    ) {
      setIsEditing(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await user.update({
        firstName: trimmedFirst,
        lastName: trimmedLast,
      });
      setSuccessMessage('Profile name updated successfully.');
      setIsEditing(false);
      setTimeout(() => {
        editButtonRef.current?.focus();
      }, 50);
    } catch (err: unknown) {
      // Preserve user input on failure
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Failed to update profile. Please try again.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Avatar Selection & File Validation
  const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
  const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    setSuccessMessage(null);

    if (file.size === 0) {
      setAvatarError('The selected image file is empty.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setAvatarError('Image size exceeds 5MB limit. Please select a smaller photo.');
      e.target.value = '';
      return;
    }

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError('Unsupported image format. Please select a JPEG, PNG, or WebP photo.');
      e.target.value = '';
      return;
    }

    const isValidSignature = await validateImageFileSignature(file);
    if (!isValidSignature) {
      setAvatarError('The file content does not match a valid JPEG, PNG, or WebP image.');
      e.target.value = '';
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setSelectedFile(file);
  };

  const handleCancelAvatar = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setAvatarError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadAvatar = async () => {
    if (!selectedFile || isAvatarSubmitting) return;

    setIsAvatarSubmitting(true);
    setAvatarError(null);
    setSuccessMessage(null);

    try {
      await user.setProfileImage({
        file: selectedFile,
      });
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setSuccessMessage('Profile photo updated successfully.');
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Failed to upload profile photo. Please try again.';
      setAvatarError(message);
    } finally {
      setIsAvatarSubmitting(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (isAvatarSubmitting) return;

    setIsAvatarSubmitting(true);
    setAvatarError(null);
    setSuccessMessage(null);

    try {
      await user.setProfileImage({
        file: null,
      });
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setSuccessMessage('Profile photo removed successfully.');
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Failed to remove profile photo. Please try again.';
      setAvatarError(message);
    } finally {
      setIsAvatarSubmitting(false);
    }
  };

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleStartAddEmail = () => {
    setIsAddingEmail(true);
    setEmailStep('input');
    setNewEmail('');
    setNewEmailError(null);
    setVerificationCode('');
    setVerificationCodeError(null);
    setEmailActionError(null);
    setEmailActionSuccess(null);
    setPendingVerificationEmailId(null);
    setPendingVerificationEmailAddress('');
    setTimeout(() => {
      newEmailInputRef.current?.focus();
    }, 50);
  };

  const handleCancelAddEmail = () => {
    setIsAddingEmail(false);
    setEmailStep('input');
    setNewEmail('');
    setNewEmailError(null);
    setVerificationCode('');
    setVerificationCodeError(null);
    setEmailActionError(null);
    setPendingVerificationEmailId(null);
    setPendingVerificationEmailAddress('');
    setTimeout(() => {
      addEmailButtonRef.current?.focus();
    }, 50);
  };

  const handleCreateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmailSubmitting) return;

    const trimmedEmail = newEmail.trim();
    if (!trimmedEmail) {
      setNewEmailError('Email address is required.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setNewEmailError('Please enter a valid email address.');
      return;
    }

    const isDuplicate = user?.emailAddresses?.some(
      (item) => item.emailAddress.toLowerCase() === trimmedEmail.toLowerCase()
    );
    if (isDuplicate) {
      setNewEmailError('This email address is already registered on your account.');
      return;
    }

    setIsEmailSubmitting(true);
    setNewEmailError(null);
    setEmailActionError(null);
    setEmailActionSuccess(null);

    try {
      const emailResource = await user!.createEmailAddress({ email: trimmedEmail });
      await emailResource.prepareVerification({ strategy: 'email_code' });

      setPendingVerificationEmailId(emailResource.id);
      setPendingVerificationEmailAddress(trimmedEmail);
      setEmailStep('verify');
      setVerificationCode('');
      setResendCooldown(30);
      setEmailActionSuccess(`Verification code sent to ${trimmedEmail}`);
      setTimeout(() => {
        verificationCodeInputRef.current?.focus();
      }, 50);
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Failed to add email address. Please verify the format and try again.';
      setEmailActionError(message);
    } finally {
      setIsEmailSubmitting(false);
    }
  };

  const handleVerifyEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmailSubmitting) return;

    const trimmedCode = verificationCode.trim();
    if (!trimmedCode) {
      setVerificationCodeError('Verification code is required.');
      return;
    }

    const emailResource = user?.emailAddresses?.find(
      (item) => item.id === pendingVerificationEmailId
    );

    if (!emailResource) {
      setEmailActionError('Unable to locate the email address to verify. Please try again.');
      return;
    }

    setIsEmailSubmitting(true);
    setVerificationCodeError(null);
    setEmailActionError(null);

    try {
      const result = await emailResource.attemptVerification({ code: trimmedCode });
      if (result.verification?.status === 'verified') {
        if (typeof user?.reload === 'function') {
          await user.reload();
        }
        setIsAddingEmail(false);
        setEmailStep('input');
        setNewEmail('');
        setVerificationCode('');
        setPendingVerificationEmailId(null);
        setPendingVerificationEmailAddress('');
        setEmailActionSuccess(`${result.emailAddress} verified and added to your account.`);
      } else {
        const errorMsg =
          result.verification?.error?.message ||
          'Verification incomplete. Please check the code and try again.';
        setVerificationCodeError(errorMsg);
      }
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Invalid or expired verification code. Please check and try again.';
      setVerificationCodeError(message);
    } finally {
      setIsEmailSubmitting(false);
    }
  };

  const handleResendVerificationCode = async () => {
    if (isEmailSubmitting || resendCooldown > 0) return;

    const emailResource = user?.emailAddresses?.find(
      (item) => item.id === pendingVerificationEmailId
    );

    if (!emailResource) {
      setEmailActionError('Unable to locate the email address. Please try again.');
      return;
    }

    setIsEmailSubmitting(true);
    setEmailActionError(null);
    setVerificationCodeError(null);

    try {
      await emailResource.prepareVerification({ strategy: 'email_code' });
      setResendCooldown(30);
      setEmailActionSuccess(`A new verification code was sent to ${pendingVerificationEmailAddress}`);
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Failed to resend verification code. Please wait before trying again.';
      setEmailActionError(message);
    } finally {
      setIsEmailSubmitting(false);
    }
  };

  const handleResumeVerification = async (email: NonNullable<typeof user>['emailAddresses'][0]) => {
    if (isEmailSubmitting) return;

    setIsAddingEmail(true);
    setEmailStep('verify');
    setPendingVerificationEmailId(email.id);
    setPendingVerificationEmailAddress(email.emailAddress);
    setVerificationCode('');
    setVerificationCodeError(null);
    setEmailActionError(null);
    setEmailActionSuccess(null);

    setIsEmailSubmitting(true);
    try {
      await email.prepareVerification({ strategy: 'email_code' });
      setResendCooldown(30);
      setEmailActionSuccess(`Verification code sent to ${email.emailAddress}`);
      setTimeout(() => {
        verificationCodeInputRef.current?.focus();
      }, 50);
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Failed to prepare verification code. Please try again.';
      setEmailActionError(message);
    } finally {
      setIsEmailSubmitting(false);
    }
  };

  const handleSetPrimaryEmail = async (emailId: string) => {
    if (isEmailSubmitting || !user) return;

    const targetEmail = user.emailAddresses?.find((e) => e.id === emailId);
    if (!targetEmail) return;

    if (targetEmail.verification?.status !== 'verified') {
      setEmailActionError('Only verified email addresses can be set as primary.');
      return;
    }

    setSettingPrimaryId(emailId);
    setIsEmailSubmitting(true);
    setEmailActionError(null);
    setEmailActionSuccess(null);

    try {
      await user.update({
        primaryEmailAddressId: emailId,
      });
      if (typeof user.reload === 'function') {
        await user.reload();
      }
      setEmailActionSuccess(`${targetEmail.emailAddress} is now your primary email address.`);
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Failed to update primary email address.';
      setEmailActionError(message);
    } finally {
      setSettingPrimaryId(null);
      setIsEmailSubmitting(false);
    }
  };

  const handleDeleteEmail = async (emailId: string) => {
    if (isEmailSubmitting || !user) return;

    if (emailId === user.primaryEmailAddressId) {
      setEmailActionError('You cannot delete your primary email address.');
      setDeletingEmailId(null);
      return;
    }

    if ((user.emailAddresses?.length || 0) <= 1) {
      setEmailActionError('At least one email address must remain associated with your account.');
      setDeletingEmailId(null);
      return;
    }

    const targetEmail = user.emailAddresses?.find((e) => e.id === emailId);
    if (!targetEmail) {
      setDeletingEmailId(null);
      return;
    }

    setIsEmailSubmitting(true);
    setEmailActionError(null);
    setEmailActionSuccess(null);

    try {
      await targetEmail.destroy();
      if (typeof user.reload === 'function') {
        await user.reload();
      }
      setEmailActionSuccess(`Removed ${targetEmail.emailAddress} from your account.`);
      setDeletingEmailId(null);
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Failed to remove email address.';
      setEmailActionError(message);
    } finally {
      setIsEmailSubmitting(false);
    }
  };

  const handleConnectGoogle = async () => {
    if (isConnectingGoogle || !user) return;

    setIsConnectingGoogle(true);
    setGoogleActionError(null);
    setGoogleActionSuccess(null);

    try {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('oauth_linked', 'google');
      const returnUrl = currentUrl.toString();

      const externalAccount = await user.createExternalAccount({
        strategy: 'oauth_google',
        redirectUrl: returnUrl,
      });

      const redirectHref =
        externalAccount.verification?.externalVerificationRedirectURL?.href ||
        externalAccount.verification?.externalVerificationRedirectURL?.toString();

      if (redirectHref) {
        window.location.href = redirectHref;
      } else {
        throw new Error('Clerk did not return a valid OAuth redirect URL.');
      }
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Failed to initiate Google account connection.';
      setGoogleActionError(message);
      setIsConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (isDisconnectingGoogle || !user || !googleAccount) return;

    if (!canSafelyDisconnect) {
      setGoogleActionError(
        'Google is your only active sign-in credential. You must set an account password before disconnecting Google to prevent lockout.'
      );
      setIsConfirmingDisconnectGoogle(false);
      return;
    }

    setIsDisconnectingGoogle(true);
    setGoogleActionError(null);
    setGoogleActionSuccess(null);

    try {
      await googleAccount.destroy();
      if (typeof user.reload === 'function') {
        await user.reload();
      }
      setGoogleActionSuccess('Google account disconnected successfully.');
      setIsConfirmingDisconnectGoogle(false);
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: Array<{ message?: string; longMessage?: string }>;
        message?: string;
      };
      const message =
        clerkErr.errors?.[0]?.longMessage ||
        clerkErr.errors?.[0]?.message ||
        clerkErr.message ||
        'Failed to disconnect Google account.';
      setGoogleActionError(message);
    } finally {
      setIsDisconnectingGoogle(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={handleModalClose}
      aria-hidden={!isOpen}
    >
      {/* Modal Shell — Unified Ivory-and-White Card with No Sidebar */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
        onClick={(e) => e.stopPropagation()}
        data-lenis-prevent
        className="relative w-full max-w-5xl max-h-[90vh] bg-[#FCFAF7] rounded-lg border border-[#E5E7EB] shadow-2xl flex flex-col overflow-hidden text-[#111827] font-sans"
      >
        {/* Brand Header (Pinned to Top) — Alongkar Premium Burgundy */}
        <header className="px-5 py-3.5 sm:px-7 sm:py-4.5 border-b border-[#2A0008] bg-[#40000D] flex items-center justify-between gap-4 sm:gap-6 shrink-0 relative overflow-hidden">
          {/* Subtle radial warmth for royal depth */}
          <div className="absolute inset-0 bg-radial-[at_top_left] from-[#5A0015]/40 via-transparent to-transparent pointer-events-none" />

          {/* Left + Center + Right-Center Visual Zones */}
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 lg:gap-5 min-w-0 flex-1">
            {/* Zone 1: Alongkar Logo */}
            <div className="flex items-center shrink-0">
              <img
                src="/alongkar-logo.png"
                alt="Alongkar"
                className="h-8 sm:h-9 lg:h-10 w-auto object-contain drop-shadow-xs"
              />
            </div>

            {/* Zone 2: Decorative Vertical Gold Divider with Central Ornament (Desktop/Tablet) */}
            <div
              className="hidden sm:flex flex-col items-center justify-center self-stretch w-3 shrink-0 py-0.5"
              aria-hidden="true"
            >
              <div className="w-[1px] flex-1 bg-gradient-to-b from-transparent via-[#C9A45D]/60 to-[#E8C98A]" />
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="shrink-0 my-0.5 text-[#E8C98A]">
                <path d="M8 0L9.6 6.4L16 8L9.6 9.6L8 16L6.4 9.6L0 8L6.4 6.4L8 0Z" fill="currentColor" />
                <circle cx="8" cy="8" r="1.3" fill="#40000D" />
              </svg>
              <div className="w-[1px] flex-1 bg-gradient-to-b from-[#E8C98A] via-[#C9A45D]/60 to-transparent" />
            </div>

            {/* Zone 3: Heading & Subtitle */}
            <div className="min-w-0">
              <h2
                id="account-settings-title"
                style={{ fontFamily: "'Playfair Display', 'Cormorant Garamond', 'Georgia', 'Cambria', serif" }}
                className="text-xl sm:text-2xl lg:text-[25px] font-medium text-[#FFFDF8] tracking-tight leading-none"
              >
                My Account
              </h2>
              <p className="text-xs sm:text-[13px] lg:text-[13.5px] font-sans text-[#E8C98A]/90 mt-0.5 sm:mt-1 font-normal tracking-normal leading-snug">
                Profile, email and sign-in settings
              </p>
            </div>
          </div>

          {/* Zone 4: Refined Close Button */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleModalClose}
            className="relative z-10 p-1.5 sm:p-2 rounded-lg border border-[#E8C98A]/30 bg-black/15 hover:bg-white/10 hover:border-[#E8C98A]/60 text-[#FFFDF8]/80 hover:text-white transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E8C98A]/40 shrink-0 self-start sm:self-center"
            aria-label="Close account settings"
          >
            <X size={18} />
          </button>
        </header>

        {/* Unified Vertically Scrollable Content Area */}
        <div
          ref={scrollContainerRef}
          data-lenis-prevent
          tabIndex={0}
          className="flex-1 min-h-0 p-5 sm:p-7 md:p-8 overflow-y-auto overflow-x-hidden space-y-6 no-scrollbar focus:outline-none"
        >
          {/* CARD 1: Profile information */}
          <section
            id="profile-section"
            aria-labelledby="profile-heading"
            className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E5E7EB] shadow-xs space-y-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#FDF2F4] text-[#70012B] flex items-center justify-center shrink-0">
                  <User size={18} />
                </div>
                <h3 id="profile-heading" className="text-base sm:text-lg font-semibold text-[#111827]">
                  Profile information
                </h3>
              </div>
              {!isEditing && (
                <button
                  ref={editButtonRef}
                  type="button"
                  onClick={handleStartEditing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#FDF2F4] text-[#70012B] hover:bg-[#FCE7EB] border border-[#F5C2CB]/40 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#70012B]/30"
                  aria-label="Update profile name"
                >
                  <Edit2 size={12} />
                  <span>Update profile</span>
                </button>
              )}
            </div>

            {/* Avatar & Display Name Layout */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5">
              {/* Circular Avatar with Camera Overlay */}
              <div className="relative group shrink-0">
                {previewUrl ? (
                  <div className="relative">
                    <img
                      src={previewUrl}
                      alt="New avatar preview"
                      className="w-18 h-18 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-[#70012B] shadow-xs ring-2 ring-[#70012B]/20"
                    />
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#70012B] text-white shadow-xs">
                      Preview
                    </span>
                  </div>
                ) : avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-full object-cover border border-[#E5E7EB] shadow-xs"
                  />
                ) : (
                  <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-[#70012B] text-white flex items-center justify-center font-bold text-2xl shadow-xs">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Camera overlay trigger button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAvatarSubmitting}
                  className="absolute bottom-0 right-0 p-1.5 rounded-full bg-white border border-[#E5E7EB] text-[#70012B] hover:bg-[#FDF2F4] shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#70012B]"
                  aria-label="Choose profile photo"
                  title="Choose profile photo"
                >
                  <Camera size={13} />
                </button>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  id="avatar-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-label="Upload profile photo"
                />
              </div>

              {/* Name Label & Details */}
              <div className="flex-1 text-center sm:text-left min-w-0 space-y-1">
                <p className="text-xs text-gray-400 font-medium">Name</p>
                <p className="text-base sm:text-lg font-semibold text-[#111827] truncate">
                  {displayName}
                </p>
                <p className="text-xs text-gray-500">
                  This name will be used for your orders and communications.
                </p>

                {/* Avatar Upload / Cancel / Remove Actions */}
                <div className="pt-2">
                  {previewUrl ? (
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <button
                        type="button"
                        onClick={handleUploadAvatar}
                        disabled={isAvatarSubmitting}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#70012B] hover:bg-[#5A0015] transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#70012B]/40"
                      >
                        {isAvatarSubmitting ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-white" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={13} />
                            <span>Upload Photo</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelAvatar}
                        disabled={isAvatarSubmitting}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <span className="text-[10.5px] text-gray-400 italic">
                        JPG, PNG or WebP under 5MB
                      </span>
                    </div>
                  ) : (
                    user.hasImage && (
                      <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          disabled={isAvatarSubmitting}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                          aria-label="Remove profile photo"
                        >
                          {isAvatarSubmitting ? (
                            <Loader2 size={11} className="animate-spin text-rose-700" />
                          ) : (
                            <Trash2 size={11} />
                          )}
                          <span>Remove photo</span>
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Avatar Error Banner */}
            {avatarError && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0" />
                  <span>{avatarError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAvatarError(null)}
                  className="text-rose-500 hover:text-rose-700 p-0.5 rounded cursor-pointer"
                  aria-label="Dismiss avatar error"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Profile Name Success Banner */}
            {successMessage && (
              <div
                role="status"
                aria-live="polite"
                className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span>{successMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMessage(null)}
                  className="text-emerald-500 hover:text-emerald-700 p-0.5 rounded cursor-pointer"
                  aria-label="Dismiss success message"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Profile Name Error Banner */}
            {errorMessage && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-rose-500 hover:text-rose-700 p-0.5 rounded cursor-pointer"
                  aria-label="Dismiss error message"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Profile Editing Inline Form */}
            {isEditing && (
              <form onSubmit={handleSubmit} className="pt-3 border-t border-[#E5E7EB] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="account-first-name"
                      className="block text-xs font-medium text-gray-700 mb-1"
                    >
                      First Name <span className="text-[#70012B]">*</span>
                    </label>
                    <input
                      ref={firstNameInputRef}
                      id="account-first-name"
                      name="firstName"
                      type="text"
                      disabled={isSubmitting}
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        if (fieldErrors.firstName) {
                          setFieldErrors((prev) => ({ ...prev, firstName: undefined }));
                        }
                      }}
                      maxLength={50}
                      placeholder="Enter your first name"
                      className={`w-full px-3.5 py-2 rounded-xl bg-white border text-xs text-gray-900 placeholder:text-gray-400 transition-all focus:outline-none focus:ring-2 ${
                        fieldErrors.firstName
                          ? 'border-rose-400 focus:ring-rose-200'
                          : 'border-gray-300 focus:border-[#70012B] focus:ring-[#70012B]/20'
                      } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
                      aria-invalid={Boolean(fieldErrors.firstName)}
                      aria-describedby={fieldErrors.firstName ? 'account-first-name-error' : undefined}
                      required
                    />
                    {fieldErrors.firstName && (
                      <p
                        id="account-first-name-error"
                        role="alert"
                        className="text-[11px] text-rose-600 mt-1 flex items-center gap-1"
                      >
                        <AlertCircle size={12} className="shrink-0" />
                        {fieldErrors.firstName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="account-last-name"
                      className="block text-xs font-medium text-gray-700 mb-1"
                    >
                      Last Name
                    </label>
                    <input
                      id="account-last-name"
                      name="lastName"
                      type="text"
                      disabled={isSubmitting}
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        if (fieldErrors.lastName) {
                          setFieldErrors((prev) => ({ ...prev, lastName: undefined }));
                        }
                      }}
                      maxLength={50}
                      placeholder="Enter your last name (optional)"
                      className={`w-full px-3.5 py-2 rounded-xl bg-white border text-xs text-gray-900 placeholder:text-gray-400 transition-all focus:outline-none focus:ring-2 ${
                        fieldErrors.lastName
                          ? 'border-rose-400 focus:ring-rose-200'
                          : 'border-gray-300 focus:border-[#70012B] focus:ring-[#70012B]/20'
                      } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
                      aria-invalid={Boolean(fieldErrors.lastName)}
                      aria-describedby={fieldErrors.lastName ? 'account-last-name-error' : undefined}
                    />
                    {fieldErrors.lastName && (
                      <p
                        id="account-last-name-error"
                        role="alert"
                        className="text-[11px] text-rose-600 mt-1 flex items-center gap-1"
                      >
                        <AlertCircle size={12} className="shrink-0" />
                        {fieldErrors.lastName}
                      </p>
                    )}
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleCancelEditing}
                    disabled={isSubmitting}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!hasChanges || isSubmitting || Boolean(fieldErrors.firstName)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#70012B] hover:bg-[#5A0015] transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#70012B]/30"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={13} className="animate-spin text-white" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check size={13} />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* CARD 2: Email addresses */}
          <section
            id="email-section"
            aria-labelledby="email-heading"
            className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E5E7EB] shadow-xs space-y-4"
          >
            {/* Header with Soft-Rose Icon Badge */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#FDF2F4] text-[#70012B] flex items-center justify-center shrink-0">
                <Mail size={18} />
              </div>
              <div>
                <h3 id="email-heading" className="text-base sm:text-lg font-semibold text-[#111827]">
                  Email addresses
                </h3>
              </div>
            </div>

            {/* Feedback Alerts */}
            {emailActionSuccess && (
              <div
                role="status"
                aria-live="polite"
                className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                  <span>{emailActionSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailActionSuccess(null)}
                  className="text-emerald-500 hover:text-emerald-700 p-0.5 rounded cursor-pointer"
                  aria-label="Dismiss message"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {emailActionError && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-rose-600" />
                  <span>{emailActionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailActionError(null)}
                  className="text-rose-500 hover:text-rose-700 p-0.5 rounded cursor-pointer"
                  aria-label="Dismiss error"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Email Addresses List */}
            <div className="space-y-2.5">
              {user.emailAddresses?.map((email) => {
                const isPrimary = email.id === user.primaryEmailAddressId;
                const isVerified = email.verification?.status === 'verified';
                const isDeleting = deletingEmailId === email.id;
                const isSettingThisPrimary = settingPrimaryId === email.id;
                const canDelete = !isPrimary && (user.emailAddresses?.length || 0) > 1;
                const isMenuOpen = openEmailMenuId === email.id;

                return (
                  <div
                    key={email.id}
                    className="p-3.5 sm:p-4 rounded-xl bg-[#FAF8F5]/90 border border-[#E5E7EB] text-xs transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[#111827] text-xs sm:text-sm truncate">
                            {email.emailAddress}
                          </span>
                          {isPrimary && (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Primary
                            </span>
                          )}
                          {isVerified ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                              <CheckCircle2 size={12} />
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                              <AlertCircle size={12} />
                              Unverified
                            </span>
                          )}
                        </div>
                        {isPrimary && (
                          <p className="text-[11.5px] text-gray-500 mt-1">
                            Used for order updates, notifications and account recovery.
                          </p>
                        )}
                      </div>

                      {/* Action Controls */}
                      <div className="relative self-end sm:self-auto shrink-0">
                        {isDeleting ? (
                          <div className="flex items-center gap-1.5 animate-in fade-in duration-100">
                            <span className="text-[11px] text-rose-700 font-medium">Remove?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteEmail(email.id)}
                              disabled={isEmailSubmitting}
                              className="px-2.5 py-1 rounded-md bg-rose-600 text-white text-[11px] font-semibold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isEmailSubmitting ? 'Removing...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingEmailId(null)}
                              disabled={isEmailSubmitting}
                              className="px-2 py-1 rounded-md bg-gray-200 text-gray-700 text-[11px] hover:bg-gray-300 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {!isPrimary && isVerified && (
                              <button
                                type="button"
                                onClick={() => handleSetPrimaryEmail(email.id)}
                                disabled={isEmailSubmitting}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-700 hover:text-[#70012B] hover:bg-[#FDF2F4] border border-[#E5E7EB] transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {isSettingThisPrimary ? (
                                  <>
                                    <Loader2 size={11} className="animate-spin text-[#70012B]" />
                                    <span>Setting...</span>
                                  </>
                                ) : (
                                  <>
                                    <Star size={11} />
                                    <span>Make Primary</span>
                                  </>
                                )}
                              </button>
                            )}

                            {!isVerified && (
                              <button
                                type="button"
                                onClick={() => handleResumeVerification(email)}
                                disabled={isEmailSubmitting}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw size={11} />
                                <span>Verify</span>
                              </button>
                            )}

                            {/* Ellipsis button for extra actions */}
                            <button
                              type="button"
                              onClick={() =>
                                setOpenEmailMenuId(isMenuOpen ? null : email.id)
                              }
                              aria-label={`Email options for ${email.emailAddress}`}
                              aria-expanded={isMenuOpen}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer focus:outline-none focus:ring-1.5 focus:ring-gray-300"
                            >
                              <MoreHorizontal size={15} />
                            </button>

                            {/* Popover Menu */}
                            {isMenuOpen && (
                              <div
                                className="absolute right-0 top-full mt-1 w-40 rounded-xl bg-white border border-[#E5E7EB] shadow-lg p-1 z-20 animate-in fade-in duration-100"
                                role="menu"
                              >
                                {isPrimary && (
                                  <div className="px-2.5 py-1.5 text-[11px] text-gray-500 font-medium flex items-center gap-1.5 select-none">
                                    <Lock size={11} className="text-gray-400" />
                                    <span>Primary address</span>
                                  </div>
                                )}
                                {!isPrimary && isVerified && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenEmailMenuId(null);
                                      void handleSetPrimaryEmail(email.id);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-gray-700 hover:bg-[#FDF2F4] hover:text-[#70012B] transition-colors cursor-pointer flex items-center gap-1.5"
                                  >
                                    <Star size={12} />
                                    <span>Make Primary</span>
                                  </button>
                                )}
                                {!isVerified && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenEmailMenuId(null);
                                      void handleResumeVerification(email);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-amber-800 hover:bg-amber-50 transition-colors cursor-pointer flex items-center gap-1.5"
                                  >
                                    <RefreshCw size={12} />
                                    <span>Verify Code</span>
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenEmailMenuId(null);
                                      setDeletingEmailId(email.id);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer flex items-center gap-1.5"
                                  >
                                    <Trash2 size={12} />
                                    <span>Remove Email</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Email / Verification Multi-Step Form */}
            {isAddingEmail ? (
              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E5E7EB] space-y-3 animate-in fade-in duration-150">
                {emailStep === 'input' ? (
                  <form onSubmit={handleCreateEmail} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#111827]">
                        Add Secondary Email Address
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelAddEmail}
                        className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                    <div>
                      <label
                        htmlFor="new-email-input"
                        className="block text-xs font-medium text-gray-700 mb-1"
                      >
                        Email Address
                      </label>
                      <input
                        id="new-email-input"
                        ref={newEmailInputRef}
                        type="email"
                        value={newEmail}
                        onChange={(e) => {
                          setNewEmail(e.target.value);
                          if (newEmailError) setNewEmailError(null);
                        }}
                        placeholder="client@example.com"
                        disabled={isEmailSubmitting}
                        className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#E5E7EB] text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#70012B] focus:ring-2 focus:ring-[#70012B]/20 disabled:opacity-50"
                      />
                      {newEmailError && (
                        <p className="mt-1 text-[11px] text-rose-600 flex items-center gap-1">
                          <AlertCircle size={11} />
                          {newEmailError}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCancelAddEmail}
                        disabled={isEmailSubmitting}
                        className="px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] text-xs text-gray-600 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isEmailSubmitting}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#70012B] hover:bg-[#5A0015] text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isEmailSubmitting ? (
                          <>
                            <Loader2 size={12} className="animate-spin text-white" />
                            <span>Sending Code...</span>
                          </>
                        ) : (
                          'Send Verification Code'
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyEmailCode} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#111827]">
                        Verify Email Address
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelAddEmail}
                        className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-gray-600">
                      Please enter the 6-digit verification code sent to{' '}
                      <span className="font-semibold text-gray-900">
                        {pendingVerificationEmailAddress}
                      </span>
                      .
                    </p>
                    <div>
                      <label
                        htmlFor="email-verification-code"
                        className="block text-xs font-medium text-gray-700 mb-1"
                      >
                        Verification Code
                      </label>
                      <input
                        id="email-verification-code"
                        ref={verificationCodeInputRef}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => {
                          setVerificationCode(e.target.value.replace(/\D/g, ''));
                          if (verificationCodeError) setVerificationCodeError(null);
                        }}
                        placeholder="123456"
                        disabled={isEmailSubmitting}
                        className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#E5E7EB] text-xs text-gray-900 tracking-widest placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none focus:border-[#70012B] focus:ring-2 focus:ring-[#70012B]/20 disabled:opacity-50"
                      />
                      {verificationCodeError && (
                        <p className="mt-1 text-[11px] text-rose-600 flex items-center gap-1">
                          <AlertCircle size={11} />
                          {verificationCodeError}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleResendVerificationCode}
                        disabled={isEmailSubmitting || resendCooldown > 0}
                        className="text-xs text-[#70012B] hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer font-medium"
                      >
                        {resendCooldown > 0
                          ? `Resend code in ${resendCooldown}s`
                          : 'Resend verification code'}
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCancelAddEmail}
                          disabled={isEmailSubmitting}
                          className="px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] text-xs text-gray-600 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isEmailSubmitting}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#70012B] hover:bg-[#5A0015] text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isEmailSubmitting ? (
                            <>
                              <Loader2 size={12} className="animate-spin text-white" />
                              <span>Verifying...</span>
                            </>
                          ) : (
                            'Verify & Complete'
                          )}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              /* + Add email address action button */
              <div className="pt-1">
                <button
                  ref={addEmailButtonRef}
                  type="button"
                  onClick={handleStartAddEmail}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-[#70012B] text-[#70012B] hover:bg-[#FDF2F4] bg-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#70012B]/20"
                >
                  <Plus size={14} />
                  <span>Add email address</span>
                </button>
              </div>
            )}
          </section>

          {/* CARD 3: Connected accounts */}
          <section
            id="connected-accounts-section"
            aria-labelledby="connected-heading"
            className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E5E7EB] shadow-xs space-y-4"
          >
            {/* Header with Soft-Rose Link Icon Badge */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#FDF2F4] text-[#70012B] flex items-center justify-center shrink-0">
                <Globe size={18} />
              </div>
              <div>
                <h3 id="connected-heading" className="text-base sm:text-lg font-semibold text-[#111827]">
                  Connected accounts
                </h3>
              </div>
            </div>

            {/* Feedback Alerts */}
            {googleActionSuccess && (
              <div
                role="status"
                aria-live="polite"
                className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                  <span>{googleActionSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setGoogleActionSuccess(null)}
                  className="text-emerald-500 hover:text-emerald-700 p-0.5 rounded cursor-pointer"
                  aria-label="Dismiss message"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {googleActionError && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-rose-600" />
                  <span>{googleActionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setGoogleActionError(null)}
                  className="text-rose-500 hover:text-rose-700 p-0.5 rounded cursor-pointer"
                  aria-label="Dismiss error"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Google Identity Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-xl bg-[#FAF8F5]/90 border border-[#E5E7EB] text-xs gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center shrink-0 shadow-2xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[#111827] text-sm">Google</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {googleAccount
                      ? googleAccount.emailAddress || googleAccount.username || 'Connected for Single Sign-On'
                      : 'Sign in quickly and securely with your Google account'}
                  </p>
                </div>
              </div>

              <div className="self-end sm:self-auto shrink-0">
                {googleAccount ? (
                  isConfirmingDisconnectGoogle ? (
                    <div className="flex items-center gap-1.5 animate-in fade-in duration-100">
                      <span className="text-[11px] text-rose-700 font-medium">Disconnect?</span>
                      <button
                        type="button"
                        onClick={handleDisconnectGoogle}
                        disabled={isDisconnectingGoogle}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isDisconnectingGoogle ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 size={11} className="animate-spin" />
                            Unlinking...
                          </span>
                        ) : (
                          'Confirm'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsConfirmingDisconnectGoogle(false)}
                        disabled={isDisconnectingGoogle}
                        className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-xs hover:bg-gray-300 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!canSafelyDisconnect) {
                          setGoogleActionError(
                            'Google is your only active sign-in credential. You must set an account password before disconnecting Google to prevent lockout.'
                          );
                          return;
                        }
                        setIsConfirmingDisconnectGoogle(true);
                      }}
                      disabled={isDisconnectingGoogle || !canSafelyDisconnect}
                      title={
                        !canSafelyDisconnect
                          ? 'Cannot disconnect: Google is your only active sign-in method'
                          : 'Disconnect Google account'
                      }
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#FDF2F4] text-[#70012B] hover:bg-[#FCE7EB] border border-[#F5C2CB]/40 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Disconnect
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    disabled={isConnectingGoogle}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#70012B] hover:bg-[#5A0015] text-xs font-semibold text-white transition-all shadow-xs cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#70012B]/30"
                  >
                    {isConnectingGoogle ? (
                      <>
                        <Loader2 size={12} className="animate-spin text-white" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      'Connect'
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Supporting Note */}
            <p className="text-xs text-gray-500">
              Use your connected accounts to sign in quickly and securely.
            </p>

            {/* Lockout Protection Note */}
            {googleAccount && !canSafelyDisconnect && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-800">
                <AlertCircle size={15} className="shrink-0 text-amber-600 mt-0.5" />
                <p className="leading-relaxed">
                  Google is currently your only active authentication credential. Set an account password before disconnecting Google to prevent account lockout.
                </p>
              </div>
            )}
          </section>

          {/* CARD 4: Account Security & Session Management */}
          <section
            id="security-section"
            aria-labelledby="security-heading"
            className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E5E7EB] shadow-xs space-y-5"
          >
            {/* Header with Soft-Rose Shield Badge */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#FDF2F4] text-[#70012B] flex items-center justify-center shrink-0">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 id="security-heading" className="text-base sm:text-lg font-semibold text-[#111827]">
                  Account security
                </h3>
                <p className="text-xs text-gray-500 font-sans mt-0.5">
                  Review active sign-in sessions and manage account protection.
                </p>
              </div>
            </div>

            {/* Sub-section A: Active Devices */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Active devices
                </h4>
                {isLoadingSessions && (
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" />
                    Checking sessions...
                  </span>
                )}
              </div>

              <div className="space-y-2.5">
                {sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="p-3.5 sm:p-4 rounded-xl bg-[#FAF8F5]/90 border border-[#E5E7EB] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center shrink-0 text-[#70012B] shadow-2xs">
                        <Monitor size={17} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-[#111827] text-xs sm:text-sm truncate">
                            {sess.deviceLabel}
                          </p>
                          {sess.isCurrent && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              This device
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {sess.browserLabel} • {sess.lastActiveText}
                        </p>
                      </div>
                    </div>

                    <div className="self-end sm:self-auto shrink-0">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Active
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Subtle Divider */}
            <div className="border-t border-[#E5E7EB] pt-4" />

            {/* Sub-section B: Delete Account */}
            <div className="space-y-3">
              <div className="p-3.5 sm:p-4 rounded-xl bg-rose-50/50 border border-rose-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-rose-100/70 border border-rose-200 flex items-center justify-center shrink-0 text-rose-700 mt-0.5 sm:mt-0">
                    <Trash2 size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-rose-950 text-xs sm:text-sm">
                      Delete account
                    </p>
                    <p className="text-[11.5px] text-rose-700/80 mt-0.5">
                      Permanently delete your profile and personal information.
                    </p>
                  </div>
                </div>

                <div className="self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-white hover:bg-rose-100/70 border border-rose-300 transition-colors cursor-pointer"
                  >
                    Delete account
                  </button>
                </div>
              </div>

              {/* Explanatory Confirmation Modal/Callout */}
              {isConfirmingDelete && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-[#FAF8F5] border border-amber-200/80 space-y-3 animate-in fade-in duration-150 text-xs text-gray-700"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-gray-900">
                        Self-Service Account Deletion Restricted
                      </p>
                      <p className="text-[11.5px] text-gray-600 leading-relaxed">
                        To preserve statutory tax invoices, gemstone authenticity certificates, and active shipment warranties, self-service account deletion is not automated. Please contact our concierge to schedule account deactivation.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-200/60">
                    <a
                      href="mailto:alongkar.official@gmail.com?subject=Account%20Deletion%20Request"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#70012B] hover:underline"
                    >
                      alongkar.official@gmail.com
                    </a>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDelete(false)}
                      className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Secured by Clerk Footer */}
          <div className="border-t border-[#E5E7EB] pt-5 pb-2">
            <div className="flex items-center justify-start text-xs text-gray-500">
              <div
                className="inline-flex items-center gap-2.5 py-1"
                aria-label="Secured by Clerk"
              >
                <span className="text-sm font-medium text-gray-500 tracking-normal">
                  Secured by
                </span>
                <img
                  src="/clerk-logo.png"
                  alt="Clerk"
                  className="h-5 w-auto object-contain shrink-0"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
