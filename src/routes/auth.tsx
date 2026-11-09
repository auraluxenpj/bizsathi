import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { SignIn } from '@/components/sign-in';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute('/auth')({ head: () => pageHead('Auraluxe mobile sign-in', 'Sign in to the Auraluxe workspace with your mobile number and SMS verification code.'), component: Auth });
function Auth() { const navigate = Route.useNavigate(); useEffect(() => { supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: sessionStorage.getItem('bizsathi-invite') ? '/invite' : '/dashboard', replace: true }); }); }, [navigate]); return <SignIn />; }