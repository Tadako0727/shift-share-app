import {useEffect,useRef,useState} from 'react';

const VIEW=280;
const OUTPUT=512;

type Props={
 file:File;
 onCancel:()=>void;
 onSave:(blob:Blob)=>void;
};

export default function AvatarCropper({file,onCancel,onSave}:Props){
 const [url,setUrl]=useState('');
 const [image,setImage]=useState<HTMLImageElement|null>(null);
 const [zoom,setZoom]=useState(1);
 const [offset,setOffset]=useState({x:0,y:0});
 const [saving,setSaving]=useState(false);
 const drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);

 useEffect(()=>{
  const next=URL.createObjectURL(file);
  setUrl(next);
  return()=>URL.revokeObjectURL(next);
 },[file]);

 const base=image?Math.max(VIEW/image.naturalWidth,VIEW/image.naturalHeight):1;
 const width=image?image.naturalWidth*base*zoom:VIEW;
 const height=image?image.naturalHeight*base*zoom:VIEW;

 const clamp=(x:number,y:number,z=zoom)=>{
  if(!image)return{x:0,y:0};
  const b=Math.max(VIEW/image.naturalWidth,VIEW/image.naturalHeight);
  const w=image.naturalWidth*b*z,h=image.naturalHeight*b*z;
  const maxX=Math.max(0,(w-VIEW)/2),maxY=Math.max(0,(h-VIEW)/2);
  return{
   x:Math.max(-maxX,Math.min(maxX,x)),
   y:Math.max(-maxY,Math.min(maxY,y))
  };
 };

 const changeZoom=(next:number)=>{
  setZoom(next);
  setOffset(current=>clamp(current.x,current.y,next));
 };

 const pointerDown=(e:React.PointerEvent)=>{
  e.currentTarget.setPointerCapture(e.pointerId);
  drag.current={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};
 };

 const pointerMove=(e:React.PointerEvent)=>{
  if(!drag.current)return;
  const x=drag.current.ox+e.clientX-drag.current.x;
  const y=drag.current.oy+e.clientY-drag.current.y;
  setOffset(clamp(x,y));
 };

 const pointerUp=()=>{drag.current=null};

 const save=async()=>{
  if(!image)return;
  setSaving(true);

  const canvas=document.createElement('canvas');
  canvas.width=OUTPUT;
  canvas.height=OUTPUT;

  const ctx=canvas.getContext('2d');
  if(!ctx){setSaving(false);return}

  const ratio=OUTPUT/VIEW;
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,OUTPUT,OUTPUT);
  ctx.translate(
   OUTPUT/2+offset.x*ratio,
   OUTPUT/2+offset.y*ratio
  );
  ctx.scale(base*zoom*ratio,base*zoom*ratio);
  ctx.drawImage(
   image,
   -image.naturalWidth/2,
   -image.naturalHeight/2
  );

  canvas.toBlob(blob=>{
   setSaving(false);
   if(blob)onSave(blob);
  },'image/webp',0.9);
 };

 return <div className="crop-backdrop">
  <section className="crop-modal">
   <div className="crop-head">
    <button type="button" onClick={onCancel}>キャンセル</button>
    <h2>画像を調整</h2>
    <button type="button" disabled={saving} onClick={()=>void save()}>
     {saving?'処理中':'保存'}
    </button>
   </div>

   <div
    className="crop-stage"
    onPointerDown={pointerDown}
    onPointerMove={pointerMove}
    onPointerUp={pointerUp}
    onPointerCancel={pointerUp}
   >
    {url&&<img
     src={url}
     alt=""
     draggable={false}
     onLoad={e=>setImage(e.currentTarget)}
     style={{
      width,
      height,
      transform:`translate(${offset.x}px,${offset.y}px)`
     }}
    />}
    <div className="crop-mask"/>
   </div>

   <label className="crop-zoom">
    <span>小</span>
    <input
     type="range"
     min="1"
     max="3"
     step="0.01"
     value={zoom}
     onChange={e=>changeZoom(Number(e.target.value))}
    />
    <span>大</span>
   </label>

   <p>画像を動かし、スライダーで大きさを調整してください。</p>
  </section>
 </div>;
}
