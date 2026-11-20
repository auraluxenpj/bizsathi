import {storedDocumentInput,type CommerceRequest} from './commerce-schemas';
export function pendingKey(userId:string,businessId:string){return `bizsathi-online-request:${userId}:${businessId}`;}
export function savePending(key:string,request:CommerceRequest){sessionStorage.setItem(key,JSON.stringify(request));}
export function readPending(key:string):CommerceRequest|null{const raw=sessionStorage.getItem(key);if(!raw)return null;const result=storedDocumentInput.safeParse(JSON.parse(raw));if(!result.success)throw new Error('Stored request could not be read.');return result.data;}
export function isConfirmedCommerceDocument(status:unknown):boolean{return status==='confirmed';}
/** A resumed draft must keep its confirmed source document, not point at the draft itself. */
export function sourceIdForDocument(source:{status?:string;source_id?:string|null}|null|undefined,fallback?:string|null):string|null{
 return source?.status==='draft'?(source.source_id??null):(fallback??null);
}
