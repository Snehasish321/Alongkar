import type { SavedAddress, SavedAddressInput } from '../types';

export interface AddressApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  errors?: Array<{ field: string; message: string }>;
  address?: SavedAddress;
  addresses?: SavedAddress[];
}

/**
 * Fetches the authenticated customer's saved addresses.
 */
export async function fetchSavedAddresses(token: string | null): Promise<SavedAddress[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/addresses', {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    throw new Error('Please sign in to access your saved addresses.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch saved addresses (HTTP ${response.status})`);
  }

  const data = await response.json();
  return data.addresses || [];
}

/**
 * Creates a new saved address for the authenticated customer.
 */
export async function createSavedAddress(
  token: string | null,
  input: SavedAddressInput
): Promise<SavedAddress> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/addresses', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (response.status === 401) {
    throw new Error('Please sign in to save this address.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      throw new Error(data.errors.map((e: any) => e.message).join('. '));
    }
    throw new Error(data.error || `Failed to save address (HTTP ${response.status})`);
  }

  return data.address;
}

/**
 * Updates an existing saved address for the authenticated customer.
 */
export async function updateSavedAddress(
  token: string | null,
  addressId: string,
  input: Partial<SavedAddressInput>
): Promise<SavedAddress> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`/api/addresses?id=${encodeURIComponent(addressId)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(input),
  });

  if (response.status === 401) {
    throw new Error('Please sign in to update this address.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      throw new Error(data.errors.map((e: any) => e.message).join('. '));
    }
    throw new Error(data.error || `Failed to update address (HTTP ${response.status})`);
  }

  return data.address;
}

/**
 * Marks an address as the default delivery address.
 */
export async function setDefaultSavedAddress(
  token: string | null,
  addressId: string
): Promise<SavedAddress> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`/api/addresses?id=${encodeURIComponent(addressId)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ action: 'set_default' }),
  });

  if (response.status === 401) {
    throw new Error('Please sign in to update your default address.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Failed to set default address (HTTP ${response.status})`);
  }

  return data.address;
}

/**
 * Deletes a saved address for the authenticated customer.
 */
export async function deleteSavedAddress(
  token: string | null,
  addressId: string
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`/api/addresses?id=${encodeURIComponent(addressId)}`, {
    method: 'DELETE',
    headers,
  });

  if (response.status === 401) {
    throw new Error('Please sign in to delete this address.');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Failed to delete address (HTTP ${response.status})`);
  }
}
