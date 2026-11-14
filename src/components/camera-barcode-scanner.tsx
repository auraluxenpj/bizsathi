import {useEffect,useRef,useState} from 'react';
import {Camera,CameraOff,LoaderCircle} from 'lucide-react';
import {Button} from './ui/button';

type DetectedBarcode={rawValue:string};
type NativeDetector={detect:(source:HTMLVideoElement)=>Promise<DetectedBarcode[]>};
type DetectorConstructor={new(options:{formats:string[]}):NativeDetector;getSupportedFormats?:()=>Promise<string[]>};
declare global {interface Window {BarcodeDetector?:DetectorConstructor}}

export function CameraBarcodeScanner({onDetected,onClose}:{onDetected:(value:string)=>void;onClose:()=>void}){
 const video=useRef<HTMLVideoElement>(null);const stream=useRef<MediaStream|null>(null);const [status,setStatus]=useState('Starting camera…');const [busy,setBusy]=useState(true);
 useEffect(()=>{
  let active=true;let frame=0;let detecting=false;
  const stop=()=>{if(frame)cancelAnimationFrame(frame);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;};
  const start=async()=>{
   try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires HTTPS and a supported browser.');
    const Detector=window.BarcodeDetector;
    if(!Detector)throw new Error('Camera barcode scanning is not supported in this browser. Use a USB or Bluetooth scanner, or enter the barcode manually.');
    const supported=Detector.getSupportedFormats?await Detector.getSupportedFormats():['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code'];
    const formats=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code'].filter(format=>supported.includes(format));
    if(!formats.length)throw new Error('This browser does not support common product barcode formats.');
    const detector=new Detector({formats});
    const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}});
    if(!active){media.getTracks().forEach(track=>track.stop());return;}
    stream.current=media;
    if(video.current){video.current.srcObject=media;await video.current.play();}
    setStatus('Point the rear camera at a product barcode.');
    setBusy(false);
    const tick=async()=>{
     if(!active||!video.current||detecting)return;
     if(video.current.readyState>=2){detecting=true;try{const found=await detector.detect(video.current);const value=found.find(item=>item.rawValue.trim())?.rawValue.trim();if(value&&active){onDetected(value);return;}}catch{setStatus('Could not read that barcode. Hold the camera steady and try again.');}finally{detecting=false;}}
     if(active)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
   }catch(error){if(active){setStatus(error instanceof Error?error.message:'Unable to start the camera. Check browser permissions.');setBusy(false);}}
  };
  void start();
  return()=>{active=false;stop();};
 },[onDetected]);
 return <section aria-label="Camera barcode scanner" className="mt-3 rounded-lg border bg-card p-3">
  <div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-medium">Camera scanner</p><Button type="button" variant="ghost" size="sm" onClick={onClose}><CameraOff className="mr-2 size-4"/>Close</Button></div>
  <video ref={video} muted playsInline className="max-h-64 w-full rounded-md bg-black object-contain" aria-label="Live barcode camera preview"/>
  <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">{busy&&<LoaderCircle className="size-4 animate-spin"/>}{status}</p>
 </section>;
}
