import { describe, expect, it } from 'vitest';
import { getAuthenticatedEmail } from '../src/auth';
import { hasPermission } from '../src/services/permission.service';
import type { AuthenticatedUser, UserRole } from '../src/types/user';

function fixtureUser(role: UserRole): AuthenticatedUser {
  return {
    id: 'synthetic-user', name: 'Synthetic User',
    email: 'synthetic@example.invalid', role, status: 'Active',
    position: null, messengerUrl: null, facebookUrl: null, contactNumber: null,
    department: { id: 'synthetic-dept', name: 'Synthetic Department' },
  };
}

describe('Cloudflare Access authentication', () => {
  it('rejects missing assertions', async () => {
    expect(await getAuthenticatedEmail(new Request('https://example.org/api/auth/me'), {
      TEAM_DOMAIN: 'https://example.cloudflareaccess.com', POLICY_AUD: 'example-audience',
    })).toBe(null);
  });
  it('rejects a development override on a public hostname', async () => {
    expect(await getAuthenticatedEmail(new Request('https://example.workers.dev/api/auth/me'), {
      APP_ENV: 'local', DEV_USER_EMAIL: 'example@example.invalid',
    })).toBe(null);
  });
  it('normalizes local email in an actual loopback context', async () => {
    expect(await getAuthenticatedEmail(new Request('http://localhost/api/auth/me'), {
      APP_ENV: 'local', DEV_USER_EMAIL: ' EXAMPLE@EXAMPLE.INVALID ',
    })).toBe('example@example.invalid');
  });
});

describe('role permission model', () => {
  it.each(['Lead','Co-Lead','Executive','Member'] as const)('enforces permissions for %s', role => {
    const actor=fixtureUser(role);
    expect(hasPermission(actor,'users.view')).toBe(true);
    expect(hasPermission(actor,'users.change_role')).toBe(role === 'Lead');
    expect(hasPermission(actor,'reports.view')).toBe(role === 'Lead' || role === 'Co-Lead');
    expect(hasPermission(actor,'projects.delete')).toBe(role === 'Lead' || role === 'Co-Lead');
  });
});
