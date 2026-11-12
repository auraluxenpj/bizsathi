import Decimal from 'decimal.js';
export function normalizeMobile(value:string){
 if(value.length>40||! /^[+0-9 ()-]+$/.test(value))return '';
 let n=value.replace(/[ ()-]/g,'');
 if(n.startsWith('+977'))n=n.slice(4);else if(n.length===13&&n.startsWith('977'))n=n.slice(3);
 return /^9[78][0-9]{8}$/.test(n)?n:'';
}
export function membershipNumber(mobile:string){const n=normalizeMobile(mobile);return n?`AL-${n}`:'';}
export function earnedPoints(total:Decimal.Value,rate=10){return Decimal.max(0,new Decimal(total)).div(100).floor().mul(rate).toNumber();}
export function remainingPoints(total:Decimal.Value,returned:Decimal.Value,rate=10){return earnedPoints(Decimal.max(0,new Decimal(total).minus(returned)),rate);}
export function customerLoyalty(phone:string,rows:{mobile:string;points:string;purchase_count:string}[]){
 const mobile=normalizeMobile(phone); if(!mobile)return null;
 const row=rows.find(r=>r.mobile===mobile);
 return {membership:membershipNumber(mobile),points:row?.points ?? '0',purchases:row?.purchase_count ?? '0'};
}