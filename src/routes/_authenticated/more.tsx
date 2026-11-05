import {createFileRoute} from '@tanstack/react-router';
import {MoreMenu} from '@/components/more-menu';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/more')({head:()=>pageHead('More','Business profile, staff, accounts, reports and utilities.'),component:MoreMenu});
