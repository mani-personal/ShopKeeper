import test from 'node:test';import assert from 'node:assert/strict';import ZX from '@zxing/library';
test('The scanner decoder reads a synthetic item-code QR image',()=>{const {QRCodeWriter,BarcodeFormat,MultiFormatReader,RGBLuminanceSource,HybridBinarizer,BinaryBitmap}=ZX;const matrix=new QRCodeWriter().encode('SHOP-12345',BarcodeFormat.QR_CODE,250,250,new Map());const w=matrix.getWidth(),h=matrix.getHeight();const pixels=new Uint8ClampedArray(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)pixels[y*w+x]=matrix.get(x,y)?0:255;const result=new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,w,h))));assert.equal(result.getText(),'SHOP-12345')});

test('Retail EAN-13 decoder reads a small off-centre product barcode',()=>{
 const {BarcodeFormat,DecodeHintType,MultiFormatReader,RGBLuminanceSource,HybridBinarizer,BinaryBitmap}=ZX;
 // EAN-13 fixture 5901234123457, including quiet zones and valid check digit.
 const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
 const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
 const code='5901234123457',parity='LGGLLG';
 let bars='0'.repeat(12)+'101';
 for(let i=0;i<6;i++)bars+=(parity[i]==='L'?L:G)[Number(code[i+1])];
 bars+='01010';
 for(const digit of code.slice(7))bars+=L[Number(digit)].replace(/[01]/g,b=>b==='0'?'1':'0');
 bars+='101'+'0'.repeat(12);
 const w=640,h=360,pixels=new Uint8ClampedArray(w*h).fill(255);
 for(let y=48;y<116;y++)for(let x=0;x<bars.length*3;x++)pixels[y*w+110+x]=bars[Math.floor(x/3)]==='1'?0:255;
 const hints=new Map([[DecodeHintType.TRY_HARDER,true],[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13]]]);
 const result=new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,w,h))),hints);
 assert.equal(result.getText(),code);
});
