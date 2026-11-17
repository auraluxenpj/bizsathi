import {validateWorkspaceView} from '@/lib/workspace-views';
import { createFileRoute } from '@tanstack/react-router';
import { BusinessAccess } from '@/components/business-access';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute('/_authenticated/businesses')({ validateSearch:validateWorkspaceView, head: () => pageHead('Employees and positions', 'Manage employee positions, permissions and branch access in BizSathi Nepal.'), component: BusinessAccess });