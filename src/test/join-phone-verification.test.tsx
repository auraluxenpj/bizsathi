import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  updateUser: vi.fn(async () => ({ error: null })),
  verifyOtp: vi.fn(async () => ({ error: null })),
  getUser: vi.fn(async () => ({ data: { user: {
    id: 'user-1',
    email: 'staff@example.com',
    email_confirmed_at: '2026-11-16T00:00:00.000Z',
    phone: null,
    phone_confirmed_at: null,
  } } })),
  preview: vi.fn(async () => ({ invitation: {
    businessName: 'Auraluxe', branchName: 'Nepalgunj', roleName: 'Store Team',
    jobTitle: 'entry_person', inviterName: 'Store Manager', expiresAt: '2026-11-23T00:00:00.000Z',
    seatsLeft: 1, inviteeMobileMasked: '••••5678',
  } })),
  accept: vi.fn(async () => ({ businessId: 'business-1' })),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children }: { children: React.ReactNode }) => children,
  useNavigate: () => mocks.navigate,
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@/lib/team-access.functions', () => ({
  previewTeamInvitation: mocks.preview,
  acceptTeamInvitation: mocks.accept,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: {
    getUser: mocks.getUser,
    updateUser: mocks.updateUser,
    verifyOtp: mocks.verifyOtp,
  } },
}));

import { Join } from '@/routes/join';

describe('team invitation phone verification', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('bizsathi-team-token', 'a'.repeat(64));
    mocks.navigate.mockClear();
    mocks.updateUser.mockClear();
    mocks.verifyOtp.mockClear();
    mocks.accept.mockClear();
    mocks.getUser.mockResolvedValue({ data: { user: {
      id: 'user-1', email: 'staff@example.com',
      email_confirmed_at: '2026-11-16T00:00:00.000Z',
      phone: null, phone_confirmed_at: null,
    } } });
    mocks.preview.mockResolvedValue({ invitation: {
      businessName: 'Auraluxe', branchName: 'Nepalgunj', roleName: 'Store Team',
      jobTitle: 'entry_person', inviterName: 'Store Manager', expiresAt: '2026-11-23T00:00:00.000Z',
      seatsLeft: 1, inviteeMobileMasked: '••••5678',
    } });
  });

  it('requires a verified invited mobile before accepting the invitation', async () => {
    render(<Join />);
    expect(await screen.findByText(/You are invited to join Auraluxe/)).toBeInTheDocument();

    const accept = screen.getByRole('button', { name: 'Accept & Join' });
    expect(accept).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Invited Nepal mobile number'), { target: { value: '+977 981-234-5678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send mobile verification code' }));

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ phone: '+9779812345678' }));
    expect(await screen.findByLabelText('SMS verification code')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('SMS verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify mobile number' }));
    await waitFor(() => expect(mocks.verifyOtp).toHaveBeenCalledWith({
      phone: '+9779812345678', token: '123456', type: 'phone_change',
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Accept & Join' }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith({ data: { token: 'a'.repeat(64) } }));
  });

  it('does not send an OTP for a number outside the supported Nepal mobile range', async () => {
    render(<Join />);
    await screen.findByText(/You are invited to join Auraluxe/);
    fireEvent.change(screen.getByLabelText('Invited Nepal mobile number'), { target: { value: '8812345678' } });
    expect(screen.getByRole('button', { name: 'Send mobile verification code' })).toBeDisabled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
