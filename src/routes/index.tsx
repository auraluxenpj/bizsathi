import { createFileRoute } from "@tanstack/react-router";
import { SignIn } from '@/components/sign-in';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute("/")({
  head: () => pageHead('Security review desk', 'BizSathi Nepal administrator security reviews and governance.'),
  component: Index,
});
function Index() {
  return <SignIn />;
}
