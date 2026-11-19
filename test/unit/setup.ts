import { vi } from 'vitest';

// Jest applied the manual mocks in test/__mocks__ to every unit test on its
// own; vitest only applies a mock that vi.mock() registers, so do it here for
// every test file.
vi.mock('@gitbeaker/rest', () => import('../__mocks__/@gitbeaker/rest.js'));
vi.mock('@gitbeaker/requester-utils', () => import('../__mocks__/@gitbeaker/requester-utils.js'));
