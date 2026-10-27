import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { SignIn } from '@/components/sign-in';
import { supabase } from '@/integrations/supabase/client';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute('/auth')({ head: () => pageHead('Administrator sign-in', 'Sign in to the BizSathi Nepal security review workspace.'), component: Auth });
function Auth() { const navigate = Route.useNavigate(); useEffect(() => { supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: '/security', replace: true }); }); }, [navigate]); return <SignIn />; }