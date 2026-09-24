'use client';
import {useEffect,useRef,useState} from 'react';
import {Camera,Upload,RotateCcw} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';

type CameraCaps = MediaTrackCapabilities & {
  focusMode?: string[]; torch?: boolean; zoom?: {min:number;max:number;step:number}
};
async function makeReader(){
  const [{BrowserMultiFormatReader},{DecodeHintType,BarcodeFormat}]=await Promise.all([
    import('@zxing/browser'),import('@zxing/library')
  ]);
  const hints=new Map();
  hints.set(DecodeHintType.TRY_HARDER,true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS,[
    BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A,BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,BarcodeFormat.CODE_39,BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,BarcodeFormat.DATA_MATRIX
  ]);
  return new BrowserMultiFormatReader(hints,{delayBetweenScanAttempts:150});
}

export function MobileScanner({open,onClose,onScan,multi=false,onScanMany}:{open:boolean;onClose:()=>void;onScan:(code:string)=>void;multi?:boolean;onScanMany?:(codes:string[])=>void}){
  const video=useRef<HTMLVideoElement>(null);
  const callbacks=useRef({onScan,onClose,onScanMany});callbacks.current={onScan,onClose,onScanMany};
  const generation=useRef(0),consumed=useRef(false);
  const stop=useRef<()=>void>(()=>{});
  const track=useRef<MediaStreamTrack|null>(null);
  const [error,setError]=useState(''),[device,setDevice]=useState('auto');
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [code,setCode]=useState(''),[retry,setRetry]=useState(0);
  const [status,setStatus]=useState(''),[caps,setCaps]=useState<CameraCaps>({});
  const [torch,setTorch]=useState(false),[zoom,setZoom]=useState(1);
  const [entries,setEntries]=useState<Record<string,number>>({});
  function accept(value:string){
    if(consumed.current)return;
    if(multi){
      const normalized=value.trim();
      if(!normalized)return;
      setEntries(previous=>previous[normalized]?previous:{...previous,[normalized]:1});
      navigator.vibrate?.(40);
      return;
    }
    consumed.current=true;stop.current();navigator.vibrate?.(80);
    callbacks.current.onScan(value);callbacks.current.onClose();
  }
  useEffect(()=>{
    if(!open)return;
    const session=++generation.current;
    let cancelled=false,controls:{stop:()=>void}|undefined,stream:MediaStream|undefined,nativeTimer:ReturnType<typeof setInterval>|undefined;
    consumed.current=false;setCode('');setError('');setCaps({});setTorch(false);
    setStatus('Starting camera…');
    const active=()=>!cancelled&&session===generation.current&&!consumed.current;
    const shutdown=()=>{if(nativeTimer)clearInterval(nativeTimer);controls?.stop();stream?.getTracks().forEach(t=>t.stop())};
    stop.current=shutdown;
    async function start(){
      try{
        if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)
          throw Error('Open this site using HTTPS and allow camera access, or use a barcode photo.');
        const reader=await makeReader();
        if(!active())return;
        const choice=device==='auto'?{facingMode:{ideal:'environment'}}:{deviceId:{exact:device}};
        stream=await navigator.mediaDevices.getUserMedia({
          audio:false,video:{...choice,width:{ideal:1920},height:{ideal:1080}}
        });
        if(!active()){shutdown();return}
        const camera=stream.getVideoTracks()[0];track.current=camera;
        const capabilities=(camera.getCapabilities?.()??{}) as CameraCaps;
        setCaps(capabilities);
        setZoom((camera.getSettings() as MediaTrackSettings&{zoom?:number}).zoom??capabilities.zoom?.min??1);
        if(capabilities.focusMode?.includes('continuous')){
          try{await camera.applyConstraints({advanced:[{focusMode:'continuous'} as MediaTrackConstraintSet]})}catch{/* optional hardware setting */}
        }
        if(!active()){shutdown();return}
        controls=await reader.decodeFromStream(stream,video.current!,result=>{
          if(result&&active())accept(result.getText());
        });
        if(!active()){shutdown();return}
        if(multi){
          const Detector=(window as any).BarcodeDetector;
          if(Detector){
            try{
              const detector=new Detector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code','data_matrix']});
              let reading=false;
              nativeTimer=setInterval(async()=>{
                if(reading||!active()||!video.current||video.current.readyState<2)return;
                reading=true;
                try{for(const hit of await detector.detect(video.current))if(active()&&hit.rawValue)accept(hit.rawValue)}catch{/* ZXing continues scanning */}
                finally{reading=false}
              },700);
            }catch{/* ZXing continues scanning */}
          }
        }
        setStatus(multi?'Scan each label in one session, then add the batch. Keep labels apart for photo detection.':'Scanning… Keep the whole barcode and white space at both ends visible.');
        try{
          const list=await navigator.mediaDevices.enumerateDevices();
          if(active())setDevices(list.filter(d=>d.kind==='videoinput'));
        }catch{/* Camera scanning remains available without the selector. */}
      }catch(e){
        shutdown();
        if(!active())return;
        setStatus('');
        const name=(e as Error).name;
        setError(name==='NotAllowedError'?'Allow camera permission in your browser, then restart the camera.':
          name==='NotReadableError'?'Camera is busy. Close other camera apps or tabs, then restart.':
          name==='NotFoundError'?'No camera found. Use a barcode photo or enter the code.':(e as Error).message);
      }
    }
    start();
    return()=>{cancelled=true;generation.current++;shutdown();track.current=null};
  },[open,device,retry,multi]);
  useEffect(()=>{if(open)setEntries({})},[open]);

  async function adjust(values:{torch?:boolean;zoom?:number}){
    const camera=track.current,session=generation.current;if(!camera)return;
    try{
      await camera.applyConstraints({advanced:[values as MediaTrackConstraintSet]});
      if(session!==generation.current)return;
      if(values.torch!==undefined)setTorch(values.torch);
      if(values.zoom!==undefined)setZoom(values.zoom);
    }catch{if(session===generation.current)setError('This camera could not apply that setting. Try another rear camera.')}
  }
  async function photo(file?:File){
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){
      setError('Use a JPG, PNG or WebP image under 10 MB.');return;
    }
    stop.current();track.current=null;setCaps({});setError('');
    const session=++generation.current;
    setStatus('Reading barcode photo…');
    const url=URL.createObjectURL(file);
    try{
      const reader=await makeReader();
      const picture=new Image();picture.src=url;await picture.decode();
      let found=0;
      // Retry at right-angle rotations so vertical retail barcodes are readable.
      for(const angle of [0,90,180,270]){
        if(session!==generation.current||consumed.current)return;
        const scale=Math.min(1,2400/Math.max(picture.naturalWidth,picture.naturalHeight));
        const w=Math.round(picture.naturalWidth*scale),h=Math.round(picture.naturalHeight*scale);
        const canvas=document.createElement('canvas');
        canvas.width=angle%180?h:w;canvas.height=angle%180?w:h;
        const ctx=canvas.getContext('2d')!;
        ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle*Math.PI/180);
        ctx.drawImage(picture,-w/2,-h/2,w,h);
        if(multi){
          const Detector=(window as any).BarcodeDetector;
          if(Detector){
            try{for(const hit of await new Detector().detect(canvas)){
              if(hit.rawValue){accept(hit.rawValue);found++}
            }}catch{/* crop-based decoder below */}
          }
          for(const divisions of [1,2,3]){
            for(let row=0;row<divisions;row++)for(let col=0;col<divisions;col++){
              if(session!==generation.current)return;
              const tile=document.createElement('canvas'),
                tileWidth=Math.min(canvas.width,Math.ceil(canvas.width/divisions*1.3)),
                tileHeight=Math.min(canvas.height,Math.ceil(canvas.height/divisions*1.3)),
                left=Math.max(0,Math.min(canvas.width-tileWidth,Math.floor(col*canvas.width/divisions-tileWidth*.15))),
                top=Math.max(0,Math.min(canvas.height-tileHeight,Math.floor(row*canvas.height/divisions-tileHeight*.15)));
              tile.width=tileWidth;tile.height=tileHeight;
              tile.getContext('2d')!.drawImage(canvas,left,top,tileWidth,tileHeight,0,0,tileWidth,tileHeight);
              try{accept(reader.decodeFromCanvas(tile).getText());found++}catch{/* scan next region */}
            }
          }
        }else{
          try{const result=reader.decodeFromCanvas(canvas);accept(result.getText());return}catch{/* try next rotation */}
        }
      }
      if(found){setStatus('Barcodes collected. Review and add the batch.');return}
      throw Error('No readable barcode found. Take a sharp photo with the entire barcode visible, or enter its printed number.');
    }catch(e){if(session===generation.current)setError((e as Error).message)}
    finally{URL.revokeObjectURL(url);if(session===generation.current)setStatus('Camera paused. Restart it to scan live.')}
  }
  return <Dialog open={open} onOpenChange={value=>{if(!value)callbacks.current.onClose()}}>
    <DialogContent className="mobile-scan-dialog">
      <DialogTitle>{multi?'Scan multiple product barcodes':'Scan a product barcode'}</DialogTitle>
      <DialogDescription>Start about 15–25 cm away. Keep the bars upright, avoid glare and hold steady. Move back if the label looks blurry.</DialogDescription>
      <video ref={video} playsInline autoPlay muted className="camera-video" style={{objectFit:'contain'}}/>
      {status&&<p role="status">{status}</p>}
      {error&&<div role="alert" className="notice error">{error}</div>}
      {multi&&<div className="multi-scanned-list">
        <b>{Object.keys(entries).length} unique products scanned</b>
        {Object.entries(entries).map(([value,quantity])=><div className="multi-scanned-row" key={value}>
          <span>{value}</span>
          <button className="btn" type="button" aria-label={'Remove one '+value} onClick={()=>setEntries(previous=>{
            const next={...previous};if(next[value]<=1)delete next[value];else next[value]--;return next;
          })}>−</button>
          <strong>{quantity}</strong>
          <button className="btn" type="button" aria-label={'Add one '+value} onClick={()=>setEntries(previous=>({...previous,[value]:(previous[value]||0)+1}))}>+</button>
        </div>)}
        <button className="btn primary" disabled={!Object.keys(entries).length} onClick={()=>{
          consumed.current=true;stop.current();
          callbacks.current.onScanMany?.(Object.entries(entries).flatMap(([value,quantity])=>Array(quantity).fill(value)));
          callbacks.current.onClose();
        }}>Add {Object.values(entries).reduce((sum,count)=>sum+count,0)} scanned items</button>
      </div>}
      {devices.length>1&&<Select value={device} onValueChange={setDevice}>
        <SelectTrigger aria-label="Choose camera"><SelectValue/></SelectTrigger>
        <SelectContent><SelectItem value="auto">Rear camera (automatic)</SelectItem>
          {devices.map((d,i)=><SelectItem key={d.deviceId} value={d.deviceId}>{d.label||'Camera '+(i+1)}</SelectItem>)}
        </SelectContent>
      </Select>}
      {caps.zoom&&<label>Camera zoom: {zoom.toFixed(1)}×
        <input aria-label="Camera zoom" type="range" min={caps.zoom.min} max={Math.min(caps.zoom.max,4)}
          step={caps.zoom.step||0.1} value={zoom} onChange={e=>void adjust({zoom:Number(e.target.value)})}/>
      </label>}
      <div className="actions">
        {caps.torch&&<button className="btn" aria-pressed={torch} onClick={()=>void adjust({torch:!torch})}>Torch {torch?'off':'on'}</button>}
        <button className="btn" onClick={()=>setRetry(x=>x+1)}><RotateCcw size={16}/>Restart camera</button>
        <label className="btn"><Upload size={16}/>Barcode photo
          <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void photo(e.target.files?.[0]);e.target.value=''}}/>
        </label>
      </div>
      <form className="form" onSubmit={e=>{e.preventDefault();if(code.trim()){accept(code.trim());setCode('')}}}>
        <label>Or enter the printed barcode number<input autoComplete="off" value={code} onChange={e=>setCode(e.target.value)} placeholder="Barcode number or item code"/></label>
        <button className="btn primary" disabled={!code.trim()}><Camera size={16}/>{multi?'Add to batch':'Use this barcode'}</button>
      </form>
    </DialogContent>
  </Dialog>;
}
