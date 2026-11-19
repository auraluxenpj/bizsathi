import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabase: { auth: authMocks },
}));

vi.mock("@/lib/mobile-login.functions", () => ({
  signInWithEmployeeId: vi.fn(),
  signInWithMobile: vi.fn(),
}));

import { SignIn } from "./sign-in";

describe("SignIn Google OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getUser.mockResolvedValue({ data: { user: null } });
    authMocks.signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: "https://accounts.google.com" }, error: null });
    authMocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    sessionStorage.clear();
  });

  it("starts Google OAuth through Supabase and returns to the auth route", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SignIn />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(authMocks.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: expect.stringMatching(/\/auth$/) },
      });
    });
  });
});

describe("SignIn email OTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getUser.mockResolvedValue({ data: { user: null } });
    authMocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    sessionStorage.clear();
  });

  it("sends a passwordless email link and uses the Sutra product name", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SignIn />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    await waitFor(() => {
      expect(authMocks.signInWithOtp).toHaveBeenCalledWith({
        email: "owner@example.com",
        options: {
          emailRedirectTo: expect.stringMatching(/\\/auth$/),
          shouldCreateUser: false,
        },
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Sutra");
  });
});
