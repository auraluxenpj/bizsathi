import type {ReportRow} from './accounting';
/** Builds a branded A4 landscape PDF of a full report; loaded only on click. */
export async function downloadReportPdf(title:string,context:Record<string,string>,rows:ReportRow[],filename:string){
 const {jsPDF}=await import('jspdf');const {default:autoTable}=await import('jspdf-autotable');
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>!['Source type','Source ID','Document ID','User ID','Movement ID','Code'].includes(k));
 doc.setFontSize(16);doc.text(`Auraluxe · ${title}`,14,16);doc.setFontSize(9);doc.setTextColor(90);
 doc.text(Object.entries(context).filter(([k])=>k!=='Report').map(([k,v])=>`${k}: ${v}`).join('   '),14,23,{maxWidth:270});
 autoTable(doc,{startY:30,head:[cols],body:rows.map(r=>cols.map(c=>String(r[c]??''))),styles:{fontSize:8,cellPadding:1.6},headStyles:{fillColor:[40,40,40]},alternateRowStyles:{fillColor:[245,245,245]},didDrawPage:()=>{const p=doc.getNumberOfPages();doc.setFontSize(8);doc.setTextColor(120);doc.text(`BizSathi Nepal · Page ${p}`,14,doc.internal.pageSize.getHeight()-6);}});
 doc.save(filename);
}
