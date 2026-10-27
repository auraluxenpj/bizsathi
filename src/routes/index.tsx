import { createFileRoute } from "@tanstack/react-router";
import { SignIn } from '@/components/sign-in';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute("/")({
  head: () => pageHead('Business account access', 'BizSathi Nepal business registration, staff access, and administrator security reviews.'),
  component: Index,
});
function Index() {
  return <SignIn />;
}
