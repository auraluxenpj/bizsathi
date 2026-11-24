import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  supabase: { auth: authMocks },
}));

const mobileMocks = vi.hoisted(() => ({ signInWithMobile: vi.fn() }));
vi.mock("@/lib/mobile-login.functions", () => ({
  signInWithEmployeeId: vi.fn(),
  signInWithMobile: mobileMocks.signInWithMobile,
}));

import { SignIn } from "./sign-in";

describe("SignIn Google OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getUser.mockResolvedValue({ data: { user: null } });
    authMocks.signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: "https://accounts.google.com" }, error: null });
    authMocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    authMocks.setSession.mockResolvedValue({ data: { session: {} }, error: null });
    mobileMocks.signInWithMobile.mockResolvedValue({ access_token: 'access-token', refresh_token: 'refresh-token' });
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

  it("creates invited accounts with a passwordless email link", async () => {
    sessionStorage.setItem("bizsathi-team-token", "invite-token-123");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SignIn />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Create account" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Test Employee" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "employee@example.com" } });
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9812345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Send secure sign-in link" }));

    await waitFor(() => {
      expect(authMocks.signInWithOtp).toHaveBeenCalledWith({
        email: "employee@example.com",
        options: {
          shouldCreateUser: true,
          data: { full_name: "Test Employee", mobile: "+9779812345678" },
          emailRedirectTo: expect.stringMatching(/\/join#token=invite-token-123$/),
        },
      });
    });
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("secure link");
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
          emailRedirectTo: expect.stringMatching(/\/auth$/),
          shouldCreateUser: false,
        },
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Sutra");
  });
});


describe("SignIn mobile password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getUser.mockResolvedValue({ data: { user: null } });
    authMocks.setSession.mockResolvedValue({ data: { session: {} }, error: null });
    mobileMocks.signInWithMobile.mockResolvedValue({ access_token: "access-token", refresh_token: "refresh-token" });
    sessionStorage.clear();
  });

  it("authenticates by mobile number and password using the server function", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SignIn />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Mobile number" }));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9812345678" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "StrongPass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with mobile" }));

    await waitFor(() => {
      expect(mobileMocks.signInWithMobile).toHaveBeenCalledWith({ data: { mobile: "9812345678", password: "StrongPass123" } });
      expect(authMocks.setSession).toHaveBeenCalledWith({ access_token: "access-token", refresh_token: "refresh-token" });
    });
  });
});
