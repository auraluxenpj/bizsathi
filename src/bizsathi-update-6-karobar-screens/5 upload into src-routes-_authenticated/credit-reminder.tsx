import {createFileRoute} from '@tanstack/react-router';
import {CreditReminder} from '@/components/credit-reminder';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/credit-reminder')({head:()=>pageHead('Credit Reminder','Send WhatsApp or SMS payment reminders to customers with pending balances.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:CreditReminder});
