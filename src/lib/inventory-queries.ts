import { queryOptions } from '@tanstack/react-query';
import { listBusinesses } from './business.functions';
export const businessQuery = queryOptions({queryKey:['businesses'],queryFn:()=>listBusinesses()});