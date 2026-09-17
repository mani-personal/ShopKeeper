export type BillImageOptions={rotation:number;top:number;bottom:number;left:number;right:number;mode:'original'|'contrast'|'threshold'};
export const defaultImageOptions:BillImageOptions={rotation:0,top:0,bottom:0,left:0,right:0,mode:'contrast'};
export async function prepareBillImage(file:File,options:BillImageOptions):Promise<string>{
 const image=await createImageBitmap(file);
 try{
  if(image.width*image.height>45000000)throw Error('Image is too large. Use a photo under 45 megapixels.');
  const rotate=document.createElement('canvas');
  const rotated=options.rotation%180!==0;
  // Bound working memory before any full-sized canvas allocations.
  const scale=Math.min(1,3000/Math.max(image.width,image.height));
  const w=Math.round(image.width*scale),h=Math.round(image.height*scale);
  rotate.width=rotated?h:w;rotate.height=rotated?w:h;
  const r=rotate.getContext('2d')!;r.translate(rotate.width/2,rotate.height/2);r.rotate(options.rotation*Math.PI/180);r.drawImage(image,-w/2,-h/2,w,h);
  const x=rotate.width*options.left/100,y=rotate.height*options.top/100;
  const cw=rotate.width*(100-options.left-options.right)/100,ch=rotate.height*(100-options.top-options.bottom)/100;
  if(cw<50||ch<50)throw Error('Crop is too small. Keep the item names, column headings and amounts.');
  const zoom=Math.min(2,Math.max(1,1800/cw),3000/Math.max(cw,ch));
  const canvas=document.createElement('canvas');canvas.width=Math.round(cw*zoom);canvas.height=Math.round(ch*zoom);
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(rotate,x,y,cw,ch,0,0,canvas.width,canvas.height);
  if(options.mode!=='original'){
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),d=pixels.data,hist=new Uint32Array(256);
   for(let i=0;i<d.length;i+=4)hist[Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2])]++;
   const count=d.length/4;let lo=0,hi=255,c=0;
   for(let i=0;i<256;i++){c+=hist[i];if(c>count*.01){lo=i;break}}
   c=0;for(let i=255;i>=0;i--){c+=hist[i];if(c>count*.01){hi=i;break}}
   for(let i=0;i<d.length;i+=4){
    let value=Math.max(0,Math.min(255,(.299*d[i]+.587*d[i+1]+.114*d[i+2]-lo)*255/Math.max(hi-lo,1)));
    if(options.mode==='threshold')value=value<160?0:255;
    d[i]=d[i+1]=d[i+2]=value;d[i+3]=255;
   }
   ctx.putImageData(pixels,0,0);
  }
  return canvas.toDataURL('image/png');
 }finally{image.close()}
}
