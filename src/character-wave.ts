// Original arm texture follows shoulder/elbow joints; only the open palm is an overlay.
type Point = [number, number];
const rigs = {
 zsh09: {
  shoulder:[315,420], elbow:[293,470], wrist:[269,508], upper:40, lower:95,
  armBox:[245,410,100,140],
  erase:'M303 416 L334 427 L306 480 L283 517 L278 538 L264 543 L249 534 L251 508 L275 467 Z',
  arm:'M303 416 L334 427 L306 480 L279 514 L259 503 L275 467 Z',
  fill:'M230 390 L350 390 L350 555 L278 555 L274 532 L288 495 L300 470 L230 470 Z',
  plate:[82,29,1], palm:[195,220,125,122], palmAnchor:[271,323], palmScale:.42,
  palmMask:'M198 220 L297 220 L315 280 L288 312 L283 334 L253 339 L242 315 L217 291 L195 264 Z',
  palmAngle:-5,
 },
 lyn22: {
  shoulder:[452,397], elbow:[483,449], wrist:[513,493], upper:-32, lower:-95,
  armBox:[432,365,132,183],
  erase:'M445 368 Q465 365 482 394 L523 460 L546 489 L563 515 L556 542 L515 542 L490 520 L463 484 L441 422 Z',
  arm:'M445 368 Q465 365 482 394 L523 460 L532 484 L501 506 L476 469 L441 422 Z',
  fill:'M420 350 L470 350 L470 430 L455 480 L455 550 L420 550 Z',
  plate:[54,43,.969], palm:[329,259,113,127], palmAnchor:[372,375], palmScale:.52,
  palmMask:'M327 259 L439 259 L442 323 L409 357 L396 385 L351 381 L350 356 L325 334 Z',
  palmAngle:-10,
 },
};
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t)};
const rotate=(p:Point, pivot:Point, angle:number):Point=>{const c=Math.cos(angle),s=Math.sin(angle),x=p[0]-pivot[0],y=p[1]-pivot[1];return[pivot[0]+c*x-s*y,pivot[1]+s*x+c*y]};
export const greetingImage=(id:string)=>`/assets/character-motion/${id}-greeting-v1.webp`;
export const greetingDuration=3000;
export function createCharacterWave(canvas:HTMLCanvasElement,original:HTMLImageElement,atlas:HTMLImageElement,id:string) {
 const rig=rigs[id as keyof typeof rigs];
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
 if(!rig||!gl)return null;
 canvas.width=original.naturalWidth;canvas.height=original.naturalHeight;
 const size=canvas.width, textures:WebGLTexture[]=[], buffers:WebGLBuffer[]=[], shaders:WebGLShader[]=[];
 const program=gl.createProgram()!;
 const dispose=()=>{textures.forEach(t=>gl.deleteTexture(t));buffers.forEach(b=>gl.deleteBuffer(b));shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext()};
 const layer=()=>{const c=document.createElement('canvas');c.width=size;c.height=size;return c};
 const base=layer(),body=base.getContext('2d')!;
 body.drawImage(original,0,0);body.save();body.clip(new Path2D(rig.erase));body.clearRect(0,0,size,size);body.clip(new Path2D(rig.fill));
 body.drawImage(atlas,0,0,543,724,rig.plate[0],rig.plate[1],543*rig.plate[2],724*rig.plate[2]);body.restore();
 const arm=layer(),armCtx=arm.getContext('2d')!;armCtx.clip(new Path2D(rig.arm));armCtx.drawImage(original,0,0);
 const palm=layer(),palmCtx=palm.getContext('2d')!;palmCtx.clip(new Path2D(rig.palmMask));palmCtx.drawImage(atlas,3*543,0,543,724,0,0,543,724);
 try {
  for(const [type,source] of [[gl.VERTEX_SHADER,`attribute vec2 point;attribute vec2 uv;varying vec2 tex;uniform float size;void main(){tex=uv;gl_Position=vec4(point.x/size*2.0-1.0,1.0-point.y/size*2.0,0.0,1.0);}`],[gl.FRAGMENT_SHADER,`precision mediump float;varying vec2 tex;uniform sampler2D picture;uniform float opacity;void main(){gl_FragColor=texture2D(picture,tex)*opacity;}`]] as const){
   const shader=gl.createShader(type)!;shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Greeting shader');gl.attachShader(program,shader);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Greeting program');gl.useProgram(program);
  gl.uniform1f(gl.getUniformLocation(program,'size'),size);gl.viewport(0,0,size,size);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  const point=gl.getAttribLocation(program,'point'),uv=gl.getAttribLocation(program,'uv'),opacity=gl.getUniformLocation(program,'opacity');
  function mesh(image:CanvasImageSource,box:number[],columns:number,rows:number){
   const texture=gl!.createTexture()!;textures.push(texture);gl!.bindTexture(gl!.TEXTURE_2D,texture);gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
   gl!.texImage2D(gl!.TEXTURE_2D,0,gl!.RGBA,gl!.RGBA,gl!.UNSIGNED_BYTE,image as HTMLCanvasElement);
   gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MIN_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_MAG_FILTER,gl!.LINEAR);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_S,gl!.CLAMP_TO_EDGE);gl!.texParameteri(gl!.TEXTURE_2D,gl!.TEXTURE_WRAP_T,gl!.CLAMP_TO_EDGE);
   const points:Point[]=[],coords:number[]=[],indices:number[]=[];
   for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){const p:Point=[box[0]+box[2]*x/columns,box[1]+box[3]*y/rows];points.push(p);coords.push(p[0]/size,p[1]/size)}
   for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1)}
   const vertices=new Float32Array(points.length*2),vbo=gl!.createBuffer()!,tbo=gl!.createBuffer()!,ibo=gl!.createBuffer()!;buffers.push(vbo,tbo,ibo);
   gl!.bindBuffer(gl!.ARRAY_BUFFER,tbo);gl!.bufferData(gl!.ARRAY_BUFFER,new Float32Array(coords),gl!.STATIC_DRAW);gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER,ibo);gl!.bufferData(gl!.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl!.STATIC_DRAW);
   return (deform:(p:Point)=>Point,alpha=1)=>{
    points.forEach((p,i)=>{const out=deform(p);vertices[i*2]=out[0];vertices[i*2+1]=out[1]});
    gl!.bindTexture(gl!.TEXTURE_2D,texture);gl!.uniform1f(opacity,alpha);gl!.bindBuffer(gl!.ARRAY_BUFFER,tbo);gl!.enableVertexAttribArray(uv);gl!.vertexAttribPointer(uv,2,gl!.FLOAT,false,0,0);
    gl!.bindBuffer(gl!.ARRAY_BUFFER,vbo);gl!.bufferData(gl!.ARRAY_BUFFER,vertices,gl!.DYNAMIC_DRAW);gl!.enableVertexAttribArray(point);gl!.vertexAttribPointer(point,2,gl!.FLOAT,false,0,0);
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER,ibo);gl!.drawElements(gl!.TRIANGLES,indices.length,gl!.UNSIGNED_SHORT,0);
   };
  }
  const drawBody=mesh(base,[0,0,size,size],32,48),drawArm=mesh(arm,rig.armBox,16,24),drawPalm=mesh(palm,rig.palm,1,1),drawOriginal=mesh(original,[0,0,size,size],1,1);
  const shoulder=rig.shoulder as Point,elbow=rig.elbow as Point,wrist=rig.wrist as Point,rad=Math.PI/180;
  return {dispose,draw(elapsed:number){
   const t=Math.max(0,Math.min(greetingDuration,elapsed));
   if(t===0||t===greetingDuration){gl.clear(gl.COLOR_BUFFER_BIT);drawOriginal(p=>p);return}
   // The elbow bends after the shoulder starts, and the hand settles before lowering.
   const lift=smooth((t-80)/620)*(1-smooth((t-2180)/740));
   const bend=smooth((t-200)/550)*(1-smooth((t-2100)/700));
   const greeting=smooth((t-750)/160)*(1-smooth((t-1950)/220));
   const wristWave=9*Math.sin((t-780)/190)*greeting;
   const upper=rig.upper*rad*lift,lower=rig.lower*rad*bend;
   const side=id==='zsh09'?1:-1;
   const lean=side*.65*rad*smooth(t/600)*(1-smooth((t-2200)/800));
   const nod=side*.8*rad*Math.sin(Math.PI*Math.min(1,t/1250))*smooth(t/200);
   const bodyMotion=(p:Point):Point=>{
    // Feet and the boy's dog remain planted; the torso and head respond gently.
    const stillDog=id==='lyn22'?smooth((p[0]-415)/45)*smooth((p[1]-510)/45):0;
    const weight=(1-smooth((p[1]-510)/145))*(1-stillDog);
    const tilted=rotate(p,[375,600],lean*weight);
    return rotate(tilted,[370,350],nod*(1-smooth((p[1]-310)/90)));
   };
   const upperLength=Math.hypot(elbow[0]-shoulder[0],elbow[1]-shoulder[1]);
   const lowerLength=Math.hypot(wrist[0]-elbow[0],wrist[1]-elbow[1]);
   const movedElbow=rotate(elbow,shoulder,upper),movedWrist=rotate(rotate(wrist,elbow,lower),shoulder,upper);
   const curve=(s:number,a:Point,b:Point,c:Point):{point:Point;tangent:Point}=>{
    const u:Point=[(b[0]-a[0])/upperLength,(b[1]-a[1])/upperLength],v:Point=[(c[0]-b[0])/lowerLength,(c[1]-b[1])/lowerLength];
    const radius=12;
    if(s<=upperLength-radius)return{point:[a[0]+u[0]*s,a[1]+u[1]*s],tangent:u};
    if(s>=upperLength+radius)return{point:[b[0]+v[0]*(s-upperLength),b[1]+v[1]*(s-upperLength)],tangent:v};
    const t=(s-upperLength+radius)/(2*radius),start:Point=[b[0]-u[0]*radius,b[1]-u[1]*radius],end:Point=[b[0]+v[0]*radius,b[1]+v[1]*radius];
    const direction:Point=[u[0]*(1-t)+v[0]*t,u[1]*(1-t)+v[1]*t],length=Math.hypot(...direction);
    return{point:[(1-t)*(1-t)*start[0]+2*(1-t)*t*b[0]+t*t*end[0],(1-t)*(1-t)*start[1]+2*(1-t)*t*b[1]+t*t*end[1]],tangent:[direction[0]/length,direction[1]/length]};
   };
   const armMotion=(p:Point):Point=>{
    const fore=((p[0]-elbow[0])*(wrist[0]-elbow[0])+(p[1]-elbow[1])*(wrist[1]-elbow[1]))/lowerLength;
    const s=fore>=0?upperLength+fore:((p[0]-shoulder[0])*(elbow[0]-shoulder[0])+(p[1]-shoulder[1])*(elbow[1]-shoulder[1]))/upperLength;
    const from=curve(s,shoulder,elbow,wrist),to=curve(s,shoulder,movedElbow,movedWrist);
    const x=p[0]-from.point[0],y=p[1]-from.point[1],along=x*from.tangent[0]+y*from.tangent[1],across=-x*from.tangent[1]+y*from.tangent[0];
    return bodyMotion([to.point[0]+to.tangent[0]*along-to.tangent[1]*across,to.point[1]+to.tangent[1]*along+to.tangent[0]*across]);
   };
   const handAt=rotate(rotate(wrist,elbow,lower),shoulder,upper);
   const originalDirection=Math.atan2(wrist[1]-elbow[1],wrist[0]-elbow[0]);
   const handAngle=originalDirection+Math.PI/2+upper+lower+(rig.palmAngle+wristWave)*rad;
   gl.clear(gl.COLOR_BUFFER_BIT);drawBody(bodyMotion);drawArm(armMotion);
   drawPalm(p=>bodyMotion(rotate([handAt[0]+(p[0]-rig.palmAnchor[0])*rig.palmScale,handAt[1]+(p[1]-rig.palmAnchor[1])*rig.palmScale],handAt,handAngle)));
   // Only the hand opening blends briefly at the unchanged rest pose.
   const rest=1-smooth(t/90)*smooth((greetingDuration-t)/90);if(rest>0)drawOriginal(p=>p,rest);
  }};
 }catch{dispose();return null}
}
