// Separate storage keeps workspace/library migration and local recovery failures
// independent. Snapshots embed the art needed to restore removed brushes.
export function createRecoveryStore() {
  let queue = Promise.resolve();
  const database = new Promise((resolve,reject) => {
    const request = indexedDB.open('trials-recovery',1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots',{keyPath:'id'});
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  database.catch(()=>{});
  async function all() { const db = await database; return new Promise((resolve,reject) => { const request = db.transaction('snapshots').objectStore('snapshots').getAll(); request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); }); }
  return {
    async list(seed) { await queue.catch(()=>{}); return (await all()).filter(item=>item.seed===seed).sort((a,b)=>b.time-a.time); },
    checkpoint(map,label='Automatic',force=false) {
      const copy=structuredClone(map);
      queue = queue.catch(()=>{}).then(async()=>{
        const records=await all(), matching=records.filter(item=>item.seed===copy.seed).sort((a,b)=>b.time-a.time), data=JSON.stringify(copy);
        const unchanged=matching[0]?.data===data;
        if ((unchanged && (label!=='Manual' || matching[0].label==='Manual')) || (!force && matching.length && Date.now()-matching[0].time<120000)) return;
        const item={id:crypto.randomUUID(),seed:copy.seed,time:Date.now(),label,data,bytes:data.length*2};
        const keep=[item,...matching.slice(0,11),...records.filter(record=>record.seed!==copy.seed)].sort((a,b)=>b.time-a.time), ids=new Set(); let bytes=0;
        for(const record of keep) if(ids.size<48 && (!ids.size || bytes+record.bytes<=96*1024*1024)){ids.add(record.id);bytes+=record.bytes;}
        const db=await database;await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');store.put(item);for(const record of records)if(!ids.has(record.id))store.delete(record.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
      });
      return queue;
    }
  };
}
