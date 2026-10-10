import type {Mark} from './pdf-engine';

export function movedPageOrder(count:number,from:number,to:number):number[]{
  if(!Number.isInteger(count)||count<1||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=count||to>=count)throw new Error('موضع الصفحة غير صالح.');
  const order=Array.from({length:count},(_,index)=>index);
  const [source]=order.splice(from,1);order.splice(to,0,source);return order;
}

// A drop slot is a gap between pages, numbered from 0 through count.
export function destinationFromSlot(count:number,from:number,slot:number):number{
  if(!Number.isInteger(slot)||slot<0||slot>count)throw new Error('موضع الإفلات غير صالح.');
  const destination=slot>from?slot-1:slot;
  movedPageOrder(count,from,destination);return destination;
}

export function remapPageMarks(marks:Mark[],order:number[]):Mark[]{
  return marks.map(mark=>{const page=order.indexOf(mark.page);if(page===-1)throw new Error('تعذر نقل تعديلات الصفحة.');return {...mark,page};});
}
