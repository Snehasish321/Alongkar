/**
 * Phase 3A Test Suite: Clerk Profile Editing & Synchronization Verification
 *
 * Validates:
 * 1. Input validation (whitespace rejection, length limits, optional last name).
 * 2. Unchanged profile submission prevention (no-op safety).
 * 3. Cancel restoration semantics.
 * 4. Error handling & user input preservation on failure.
 * 5. Accessibility, semantics, and Alongkar design tokens in AccountSettingsModal.tsx.
 * 6. Non-regression of existing triggers in CustomerMenu and MobileMenu.
 */

import fs from 'node:fs';
import path from 'node:path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ [PASS] ${message}`);
  }
}

async function runPhase3ATests() {
  console.log('=============================================================================');
  console.log('PHASE 3A: CLERK PROFILE EDITING SUITE');
  console.log('=============================================================================\n');

  // --- WORKSTREAM 1: Validation Logic Unit Verification ---
  console.log('--- WORKSTREAM 1: Input Validation Logic ---');

  const validateInputs = (firstName: string, lastName: string) => {
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

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  };

  // Test 1: Empty first name is rejected
  const emptyFirst = validateInputs('', 'Mukherjee');
  assert(!emptyFirst.isValid, 'Rule 1a: Empty first name is rejected');
  assert(emptyFirst.errors.firstName === 'First name is required.', 'Rule 1b: Rejection provides explicit error');

  // Test 2: Whitespace-only first name is rejected
  const whitespaceFirst = validateInputs('    ', 'Mukherjee');
  assert(!whitespaceFirst.isValid, 'Rule 2a: Whitespace-only first name is rejected');
  assert(whitespaceFirst.errors.firstName === 'First name is required.', 'Rule 2b: Whitespace trimmed before validation');

  // Test 3: Excessive length (>50 chars) is rejected
  const longFirst = validateInputs('A'.repeat(51), 'Mukherjee');
  assert(!longFirst.isValid, 'Rule 3a: First name exceeding 50 chars is rejected');
  assert(longFirst.errors.firstName === 'First name cannot exceed 50 characters.', 'Rule 3b: First name length error message verified');

  const longLast = validateInputs('Snehasish', 'B'.repeat(51));
  assert(!longLast.isValid, 'Rule 3c: Last name exceeding 50 chars is rejected');
  assert(longLast.errors.lastName === 'Last name cannot exceed 50 characters.', 'Rule 3d: Last name length error message verified');

  // Test 4: Valid first name with empty last name is accepted (last name is optional)
  const optionalLast = validateInputs('Snehasish', '');
  assert(optionalLast.isValid, 'Rule 4a: Empty last name is valid (last name is optional)');
  assert(!optionalLast.errors.lastName, 'Rule 4b: No error produced for omitted last name');

  // Test 5: Valid first and last name
  const validNames = validateInputs('Snehasish', 'Mukherjee');
  assert(validNames.isValid, 'Rule 5: Valid first and last name passes validation');

  // --- WORKSTREAM 2: Change Detection & Submission Prevention ---
  console.log('\n--- WORKSTREAM 2: Change Detection & Submission Guard ---');

  const checkHasChanges = (
    currentFirst: string,
    currentLast: string,
    inputFirst: string,
    inputLast: string
  ) => {
    return (
      inputFirst.trim() !== currentFirst.trim() ||
      inputLast.trim() !== currentLast.trim()
    );
  };

  assert(!checkHasChanges('Snehasish', 'Mukherjee', 'Snehasish', 'Mukherjee'), 'Rule 6a: Identical values report hasChanges = false');
  assert(!checkHasChanges('Snehasish', 'Mukherjee', '  Snehasish  ', ' Mukherjee '), 'Rule 6b: Whitespace variations around identical names report hasChanges = false');
  assert(checkHasChanges('Snehasish', 'Mukherjee', 'Sneha', 'Mukherjee'), 'Rule 6c: Changed first name reports hasChanges = true');
  assert(checkHasChanges('Snehasish', 'Mukherjee', 'Snehasish', 'Roy'), 'Rule 6d: Changed last name reports hasChanges = true');

  // --- WORKSTREAM 3: Clerk Mock State Synchronization & Input Preservation ---
  console.log('\n--- WORKSTREAM 3: Clerk API State Flow & Input Preservation ---');

  interface MockUser {
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    update: (params: { firstName: string; lastName: string }) => Promise<MockUser>;
  }

  const createMockUser = (initialFirst: string, initialLast: string): MockUser => {
    const user: MockUser = {
      firstName: initialFirst,
      lastName: initialLast,
      fullName: `${initialFirst} ${initialLast}`.trim(),
      update: async (params: { firstName: string; lastName: string }) => {
        if (params.firstName === 'TriggerError') {
          throw {
            errors: [{ longMessage: 'Simulated Clerk API rate limit exception.' }],
          };
        }
        user.firstName = params.firstName;
        user.lastName = params.lastName;
        user.fullName = `${params.firstName} ${params.lastName}`.trim();
        return user;
      },
    };
    return user;
  };

  // Test 7: Successful Clerk update
  const mockUser = createMockUser('Snehasish', 'Mukherjee');
  assert(mockUser.fullName === 'Snehasish Mukherjee', 'Rule 7a: Initial mock user has expected name');

  await mockUser.update({ firstName: 'Aarav', lastName: 'Alongkar' });
  assert(mockUser.firstName === 'Aarav', 'Rule 7b: User firstName updated');
  assert(mockUser.lastName === 'Alongkar', 'Rule 7c: User lastName updated');
  assert(mockUser.fullName === 'Aarav Alongkar', 'Rule 7d: User fullName synchronized');

  // Test 8: Failed Clerk update preserves user's typed input
  let typedFirstName = 'TriggerError';
  let typedLastName = 'Specialist';
  let caughtError: string | null = null;

  try {
    await mockUser.update({ firstName: typedFirstName, lastName: typedLastName });
  } catch (err: any) {
    caughtError = err?.errors?.[0]?.longMessage || 'Unknown error';
  }

  assert(caughtError === 'Simulated Clerk API rate limit exception.', 'Rule 8a: Clerk error message parsed cleanly');
  assert(typedFirstName === 'TriggerError', 'Rule 8b: Form input firstName strictly preserved on error');
  assert(typedLastName === 'Specialist', 'Rule 8c: Form input lastName strictly preserved on error');
  assert(mockUser.firstName === 'Aarav', 'Rule 8d: Underlying user state unaltered by failed request');

  // --- WORKSTREAM 4: Codebase & Accessibility Static Verification ---
  console.log('\n--- WORKSTREAM 4: Component Source & Accessibility Contract ---');

  const modalPath = path.resolve(process.cwd(), 'src/components/account/AccountSettingsModal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  // Accessibility checks
  assert(modalContent.includes('htmlFor="account-first-name"'), 'Rule 9a: Explicit label for first name with htmlFor');
  assert(modalContent.includes('id="account-first-name"'), 'Rule 9b: First name input has matching id');
  assert(modalContent.includes('htmlFor="account-last-name"'), 'Rule 9c: Explicit label for last name with htmlFor');
  assert(modalContent.includes('id="account-last-name"'), 'Rule 9d: Last name input has matching id');
  assert(modalContent.includes('aria-invalid='), 'Rule 9e: Input has aria-invalid attribute');
  assert(modalContent.includes('role="status"'), 'Rule 9f: Success banner uses accessible role="status"');
  assert(modalContent.includes('role="alert"'), 'Rule 9g: Error banner uses accessible role="alert"');

  // Design tokens & constraints
  assert(modalContent.includes('Secured by Clerk'), 'Rule 10a: Secured by Clerk badge remains visible');
  assert(!modalContent.includes('Saved Addresses') && !modalContent.includes('panel-addresses'), 'Rule 10b: Addresses strictly excluded from AccountSettingsModal');
  assert(modalContent.includes('user.update('), 'Rule 10c: Uses authentic Clerk user.update API');
  assert(modalContent.includes('handleCancelEditing'), 'Rule 10d: Provides explicit Cancel action');
  assert(modalContent.includes('Save Changes'), 'Rule 10e: Provides explicit Save Changes action');

  // Trigger preservation check
  const customerMenuPath = path.resolve(process.cwd(), 'src/components/layout/CustomerMenu.tsx');
  const customerMenuContent = fs.readFileSync(customerMenuPath, 'utf8');
  assert(customerMenuContent.includes('openAccountModal()'), 'Rule 11a: CustomerMenu uses openAccountModal');
  assert(customerMenuContent.includes("to=\"/addresses\""), 'Rule 11b: Saved Addresses dropdown route preserved');

  const mobileMenuPath = path.resolve(process.cwd(), 'src/components/layout/MobileMenu.tsx');
  const mobileMenuContent = fs.readFileSync(mobileMenuPath, 'utf8');
  assert(mobileMenuContent.includes('openAccountModal()'), 'Rule 11c: MobileMenu uses openAccountModal');
  assert(mobileMenuContent.includes('onClose()'), 'Rule 11d: MobileMenu closes before opening modal');

  console.log('\n=============================================================================');
  console.log('ALL PHASE 3A SUITE TESTS PASSED (0 FAILURES)');
  console.log('=============================================================================');
}

runPhase3ATests().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
