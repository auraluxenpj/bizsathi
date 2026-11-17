import {vaultInput,type DraftVault,scopeKey} from './offline-drafts';

type Envelope={scope:string;revision:number;salt:number[];iv:number[];cipher:number[];mode?:'device'|'passphrase'};
const unlocked=new Set<OfflineVault>();
export function lockOfflineVaults(){for(const vault of unlocked)vault.lock();if(typeof window!=='undefined')window.dispatchEvent(new Event('bizsathi-offline-lock'));}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open('bizsathi-encrypted-pos',2);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('vaults'))db.createObjectStore('vaults',{keyPath:'scope'});if(!db.objectStoreNames.contains('device-keys'))db.createObjectStore('device-keys',{keyPath:'scope'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Local storage is unavailable. Draft was not saved.'));});}
async function load(scope:string):Promise<Envelope|undefined>{const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('vaults','readonly');const r=tx.objectStore('vaults').get(scope);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Encrypted drafts could not be read.'));});}finally{db.close();}}
async function loadDeviceKey(scope:string):Promise<CryptoKey|undefined>{const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('device-keys','readonly').objectStore('device-keys').get(scope);r.onsuccess=()=>resolve((r.result as {key?:CryptoKey}|undefined)?.key);r.onerror=()=>reject(new Error('Device unlock key could not be read.'));});}finally{db.close();}}
async function saveDeviceKey(scope:string,key:CryptoKey):Promise<CryptoKey>{const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('device-keys','readwrite');const store=tx.objectStore('device-keys');let selected=key;const request=store.get(scope);request.onsuccess=()=>{const existing=(request.result as {key?:CryptoKey}|undefined)?.key;if(existing)selected=existing;else store.put({scope,key});};tx.oncomplete=()=>resolve(selected);tx.onerror=()=>reject(new Error('Device key could not be stored. Browser storage may not support persistent cryptographic keys.'));tx.onabort=()=>reject(new Error('Device key could not be stored.'));});}finally{db.close();}}
async function commit(record:Envelope,previous:number){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('vaults','readwrite');const store=tx.objectStore('vaults');const r=store.get(record.scope);r.onsuccess=()=>{const existing=r.result as Envelope|undefined;if((existing?.revision??0)!==previous){tx.abort();return;}store.put(record);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('Draft not saved: storage failed or another tab changed this vault. Lock and unlock to reload.'));tx.onerror=()=>reject(new Error('Draft not saved. Check available device storage.'));});}finally{db.close();}}
export async function deriveVaultKey(passphrase:string,salt:Uint8Array){if(passphrase.length<12)throw new Error('Use a device passphrase of at least 12 characters.');const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:new Uint8Array(salt),iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function encryptVault(value:DraftVault,key:CryptoKey,scope:string){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(scope)},key,new TextEncoder().encode(JSON.stringify(vaultInput.parse(value))));return{iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher))};}
export async function decryptVault(record:Pick<Envelope,'scope'|'iv'|'cipher'>,key:CryptoKey){const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(record.iv),additionalData:new TextEncoder().encode(record.scope)},key,new Uint8Array(record.cipher));return vaultInput.parse(JSON.parse(new TextDecoder().decode(plain)));}
function newDeviceKey(){return crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export class OfflineVault{
 private key:CryptoKey|null=null;private revision=0;private generation=0;
 constructor(readonly scope:string){}
 lock(){this.key=null;this.generation++;unlocked.delete(this);}
 async unlock(initial?:DraftVault):Promise<DraftVault>{
  const generation=this.generation;const existing=await load(this.scope);
  if(existing&&existing.mode!=='device')throw new Error('LEGACY_PASSPHRASE_REQUIRED');
  let key=existing?await loadDeviceKey(this.scope):undefined;
  if(existing&&!key)throw new Error('This device key is unavailable. Existing encrypted drafts were kept; restore this browser profile or use the original recovery method.');
  if(!existing){if(!initial)throw new Error('Initial offline cache is required.');key=await saveDeviceKey(this.scope,await newDeviceKey());}
  let value:DraftVault;
  try{value=existing?await decryptVault(existing,key!):vaultInput.parse(initial);}catch{throw new Error('Device unlock failed. Encrypted records were kept.');}
  if(scopeKey(value.cache.userId,value.cache.businessId,value.cache.branchId)!==this.scope)throw new Error('Encrypted cache belongs to another account or branch.');
  if(generation!==this.generation)throw new Error('Device locked during unlock.');
  this.key=key!;this.revision=existing?.revision??0;unlocked.add(this);
  if(!existing)try{await this.save(value);}catch(e){this.lock();throw e;}
  return value;
 }
 async unlockLegacy(passphrase:string):Promise<DraftVault>{
  const generation=this.generation;const existing=await load(this.scope);
  if(!existing||existing.mode==='device')throw new Error('No legacy encrypted draft was found for this branch.');
  const key=await deriveVaultKey(passphrase,new Uint8Array(existing.salt));let value:DraftVault;
  try{value=await decryptVault(existing,key);}catch{throw new Error('Cannot recover drafts. Check the original passphrase; encrypted records were kept.');}
  if(scopeKey(value.cache.userId,value.cache.businessId,value.cache.branchId)!==this.scope)throw new Error('Encrypted cache belongs to another account or branch.');
  if(generation!==this.generation)throw new Error('Device locked during recovery.');
  const deviceKey=await saveDeviceKey(this.scope,await newDeviceKey());
  const encrypted=await encryptVault(value,deviceKey,this.scope);
  await commit({scope:this.scope,revision:existing.revision+1,salt:[],mode:'device',...encrypted},existing.revision);
  if(generation!==this.generation)throw new Error('Device locked during recovery.');
  this.key=deviceKey;this.revision=existing.revision+1;unlocked.add(this);return value;
 }
 async save(value:DraftVault){
  const key=this.key;const generation=this.generation;if(!key)throw new Error('Unlock the device before saving.');
  if(scopeKey(value.cache.userId,value.cache.businessId,value.cache.branchId)!==this.scope)throw new Error('Wrong account or branch.');
  const encrypted=await encryptVault(value,key,this.scope);if(generation!==this.generation)throw new Error('Device locked before saving.');
  await commit({scope:this.scope,revision:this.revision+1,salt:[],mode:'device',...encrypted},this.revision);this.revision++;
 }
}
