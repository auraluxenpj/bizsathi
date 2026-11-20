import {validateWorkspaceView} from '@/lib/workspace-views';
import { createFileRoute } from '@tanstack/react-router';
import { BusinessAccess } from '@/components/business-access';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute('/_authenticated/businesses')({ validateSearch:validateWorkspaceView, head: () => pageHead('Branches & staff', 'Manage AURALUXE branches, employees, positions and branch access in Sutra.'), component: BusinessAccess });