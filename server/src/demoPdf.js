// Small, valid, text-only PDF for fictional showcase records. No image/model generation.
export function samplePdf(text){
  const words=text.replace(/[^\x20-\x7e]/g,' ').split(/\s+/);const lines=['MediVault | Synthetic portfolio record',''];let line='';
  for(const word of words){if((line+' '+word).trim().length>82){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);
  const escape=value=>value.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
  const stream=`BT /F1 11 Tf 50 742 Td 15 TL ${lines.map(t=>`(${escape(t)}) Tj T*`).join('\n')} ET`;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let result='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(result));result+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(result);
  result+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
