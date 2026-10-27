import Decimal from 'decimal.js';
export function normalizeMobile(value:string){
 if(value.length>40||! /^[+0-9 ()-]+$/.test(value))return '';
 let n=value.replace(/[ ()-]/g,'');
 if(n.startsWith('+977'))n=n.slice(4);else if(n.length===13&&n.startsWith('977'))n=n.slice(3);
 return /^9[78][0-9]{8}$/.test(n)?n:'';
}
export function membershipNumber(mobile:string){const n=normalizeMobile(mobile);return n?`AL-${n}`:'';}
export function earnedPoints(total:Decimal.Value){return new Decimal(total).div(100).floor().toNumber();}
export function remainingPoints(total:Decimal.Value,returned:Decimal.Value){return earnedPoints(Decimal.max(0,new Decimal(total).minus(returned)));}