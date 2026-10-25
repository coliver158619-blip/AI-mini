// Eyelids sample the original texture; greeting arms are rendered separately.
import { greetingDuration } from './character-wave';
export type CharacterAction = 'wave' | 'blink' | 'wink';
export const actionDuration: Record<CharacterAction, number> = { wave: greetingDuration, blink: 260, wink: 520 };
const rigs: Record<string, { eyes: number[]; skin: number[] }> = {
 zsh09: { eyes: [321, 270, 409, 260, 28, 28], skin: [350, 285, 451, 284] },
 lyn22: { eyes: [311, 292, 397, 285, 29, 28], skin: [344, 310, 442, 310] },
};
export const hasCharacterRig = (id: string) => !!rigs[id];

export function createCharacterRig(canvas: HTMLCanvasElement, image: HTMLImageElement, id: string) {
 const rig = rigs[id];
 const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
 if (!gl || !rig) return null;
 canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
 const shaders: WebGLShader[] = [], buffers: WebGLBuffer[] = [];
 const program = gl.createProgram()!, texture = gl.createTexture()!;
 function shader(type: number, source: string) {
  const compiled = gl!.createShader(type)!; shaders.push(compiled);
  gl!.shaderSource(compiled, source); gl!.compileShader(compiled);
  if (!gl!.getShaderParameter(compiled, gl!.COMPILE_STATUS)) throw new Error('Character shader unavailable');
  gl!.attachShader(program, compiled);
 }
 const dispose = () => { buffers.forEach(buffer => gl.deleteBuffer(buffer)); shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteTexture(texture); gl.deleteProgram(program); gl.getExtension('WEBGL_lose_context')?.loseContext(); };
 try {
  shader(gl.VERTEX_SHADER, `
   attribute vec2 point;
   varying vec2 uv;
   uniform vec2 size;
   uniform vec4 eyes;
   uniform vec2 eyeRadius;
   uniform vec3 motion;
   void main() {
    uv = point;
    vec2 p = point * size;
    gl_Position = vec4(p.x/size.x*2.0-1.0, 1.0-p.y/size.y*2.0, 0.0, 1.0);
   }`);
  shader(gl.FRAGMENT_SHADER, `
   precision highp float;
   varying vec2 uv;
   uniform sampler2D picture;
   uniform vec2 size;
   uniform vec4 eyes;
   uniform vec2 eyeRadius;
   uniform vec4 skin;
   uniform vec3 motion;
   vec4 eyelid(vec4 original, vec2 p, vec2 center, vec2 skinPoint, float close) {
    vec2 local=(p-center)/eyeRadius;
    float mask=1.0-smoothstep(.95,1.08,length(local));
    if (close<.001 || mask<.001) return original;
    float crease=.12+.15*(1.0-local.x*local.x);
    float sourceY=crease+(local.y-crease)/max(.025,1.0-close);
    vec4 skinColor=mix(texture2D(picture,skinPoint/size),texture2D(picture,(center+vec2(0.0,eyeRadius.y+9.0))/size),clamp((local.y+1.0)*.5,0.0,1.0));
    vec4 eyeColor=texture2D(picture,(center+vec2(local.x*eyeRadius.x,sourceY*eyeRadius.y))/size);
    float inside=1.0-smoothstep(.92,1.02,length(vec2(local.x,sourceY)));
    vec4 lid=mix(skinColor,eyeColor,inside);
    float lash=(1.0-smoothstep(.025,.075,abs(local.y-crease)))*(1.0-smoothstep(.75,.95,abs(local.x)))*smoothstep(.75,.94,close);
    lid=mix(lid,vec4(.17,.10,.065,1.0),lash);
    return mix(original,lid,mask);
   }
   void main() {
    vec2 p=uv*size;
    vec4 color=texture2D(picture,uv);
    color=eyelid(color,p,eyes.xy,skin.xy,motion.x);
    color=eyelid(color,p,eyes.zw,skin.zw,motion.y);
    gl_FragColor=color;
   }`);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Character program unavailable');
  gl.useProgram(program);
  const columns = 128, rows = 128, vertices = new Float32Array((columns+1)*(rows+1)*2), indices = new Uint16Array(columns*rows*6);
  let v=0, i=0;
  for (let y=0; y<=rows; y++) for (let x=0; x<=columns; x++) { vertices[v++]=x/columns; vertices[v++]=y/rows; }
  for (let y=0; y<rows; y++) for (let x=0; x<columns; x++) { const a=y*(columns+1)+x, b=a+columns+1; indices.set([a,b,a+1,a+1,b,b+1],i); i+=6; }
  const vertexBuffer = gl.createBuffer()!, indexBuffer = gl.createBuffer()!; buffers.push(vertexBuffer,indexBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
  const attribute=gl.getAttribLocation(program,'point'); gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D,texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.uniform2f(gl.getUniformLocation(program,'size'),image.naturalWidth,image.naturalHeight);
  gl.uniform4fv(gl.getUniformLocation(program,'eyes'),rig.eyes.slice(0,4));
  gl.uniform2fv(gl.getUniformLocation(program,'eyeRadius'),rig.eyes.slice(4));
  gl.uniform4fv(gl.getUniformLocation(program,'skin'),rig.skin);
  const movement=gl.getUniformLocation(program,'motion');
  gl.viewport(0,0,canvas.width,canvas.height);
  const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
  return {
   draw(action: CharacterAction, elapsed: number) {
    const close=action==='blink' ? smooth(elapsed/75)*(1-smooth((elapsed-125)/135)) : smooth(elapsed/110)*(1-smooth((elapsed-320)/200));
    const right=close*.94, left=action==='blink'?right:0;
    gl.uniform3f(movement,left,right,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
   }, dispose,
  };
 } catch { dispose(); return null; }
}
