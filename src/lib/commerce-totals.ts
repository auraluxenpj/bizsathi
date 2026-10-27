import Decimal from 'decimal.js';
export function commerceTotals(data:{documents:{kind:string;status:string;total:number;branch_id:string;document_date:string}[];journals:{account_code:string;debit:number;credit:number;branch_id:string}[]},branchId:string,from:string,to:string){
 const docs=data.documents.filter(d=>d.status==='confirmed'&&(!branchId||d.branch_id===branchId)&&d.document_date>=from&&d.document_date<=to);const journals=data.journals.filter(j=>!branchId||j.branch_id===branchId);
 const balance=(account:string)=>journals.filter(j=>j.account_code===account).reduce((s,j)=>s.plus(j.debit).minus(j.credit),new Decimal(0)).toNumber();
 const volume=(kind:string,ret:string)=>docs.reduce((s,d)=>s.plus(d.kind===kind?d.total:d.kind===ret?-d.total:0),new Decimal(0)).toNumber();
 return {sales:volume('sale','sale_return'),purchases:volume('purchase','purchase_return'),cash:balance('cash'),bank:balance('bank'),receivables:balance('receivable'),payables:-balance('payable'),grossProfit:null,inventoryValue:null};
}