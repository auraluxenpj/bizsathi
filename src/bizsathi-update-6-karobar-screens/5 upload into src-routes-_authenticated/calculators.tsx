import {createFileRoute} from '@tanstack/react-router';
import {Calculators} from '@/components/calculators';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/calculators')({head:()=>pageHead('Calculators','VAT, discount and profit margin calculators.'),component:Calculators});
