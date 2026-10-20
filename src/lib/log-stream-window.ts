type Entry={id:string};

// Remember only IDs still needed by the bounded input, pending queue or displayed rows.
// Animation callbacks may never fire for rows that leave the viewport, so prune those too.
export function pruneLogStream(known:Set<string>,sequence:Map<string,number>,fresh:Set<string>,...windows:readonly Entry[][]){
 const retained=new Set(windows.flatMap(rows=>rows.map(row=>row.id)));
 for(const id of known)if(!retained.has(id))known.delete(id);
 for(const id of sequence.keys())if(!retained.has(id))sequence.delete(id);
 const next=new Set([...fresh].filter(id=>retained.has(id)));
 return next.size===fresh.size?fresh:next;
}

export function logStreamSnapshot<T extends Entry>(rows:T[],limit:number):T[]{
 const unique=new Map<string,T>();
 for(const row of rows){if(!unique.has(row.id))unique.set(row.id,row);if(unique.size>=limit)break}
 return [...unique.values()];
}
