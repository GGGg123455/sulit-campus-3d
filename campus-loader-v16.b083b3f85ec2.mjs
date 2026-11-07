// Small, same-origin transfers with an idle timeout, one retry, progress and
// content-hash caching. No external CDN or third-party request is required.
const CACHE='sulit-resources-v16';
export async function decodeGzip(bytes){
 const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(a[0]!==31||a[1]!==139)return a;
 if(typeof DecompressionStream!=='undefined')return new Uint8Array(await new Response(new Blob([a]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 const {gunzipSync}=await import('./vendor/fflate.js');return gunzipSync(a);
}
export async function loadResource(url,{json=false,onProgress,signal,retries=1,idleMs=18000,fetchImpl=fetch,cacheStorage=globalThis.caches}={}){
 if(signal?.aborted)throw new DOMException('下载已取消','AbortError');
 const key=new URL(url,globalThis.location?.href||'https://local.test/').href;
 let cache;try{cache=await cacheStorage?.open(CACHE);const cached=await cache?.match(key);if(cached){const bytes=new Uint8Array(await cached.arrayBuffer());onProgress?.({loaded:bytes.length,total:bytes.length,cached:true});const out=await decodeGzip(bytes);return json?JSON.parse(new TextDecoder().decode(out)):out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);}}catch{}
 let lastError;
 for(let attempt=0;attempt<=retries;attempt++){
  if(signal?.aborted)throw new DOMException('下载已取消','AbortError');
  const control=new AbortController();let timer,expired=false;const abort=()=>control.abort();signal?.addEventListener('abort',abort,{once:true});
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>{expired=true;control.abort();},idleMs);};
  try{
   arm();const response=await fetchImpl(url,{signal:control.signal,cache:'force-cache'});if(!response.ok)throw Error('下载失败（'+response.status+'）');
   const total=Number(response.headers.get('content-length'))||0,chunks=[];let loaded=0;
   if(response.body?.getReader){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.length;arm();onProgress?.({loaded,total,attempt});}}
   else{const b=new Uint8Array(await response.arrayBuffer());chunks.push(b);loaded=b.length;onProgress?.({loaded,total:total||loaded,attempt});}
   clearTimeout(timer);const bytes=new Uint8Array(loaded);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}
   if(!loaded)throw Error('下载内容为空');
   // Never keep a partial stream or a response whose gzip/JSON cannot decode.
   const out=await decodeGzip(bytes),value=json?JSON.parse(new TextDecoder().decode(out)):out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
   try{await cache?.put(key,new Response(bytes,{headers:{'content-type':'application/octet-stream'}}));}catch{}
   return value;
  }catch(e){lastError=expired?Error('网络长时间没有响应'):e;if(signal?.aborted)throw new DOMException('下载已取消','AbortError');if(attempt<retries)await new Promise(r=>setTimeout(r,300));}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 throw lastError;
}

export function formatTransfer({loaded,total,cached}){const mb=n=>(n/1e6).toFixed(1)+'MB';return cached?'已缓存':total?Math.min(100,Math.round(loaded/total*100))+'% · '+mb(loaded)+' / '+mb(total):mb(loaded);}
