'use client';
import {useEffect,useState} from 'react';
import type {HostMetrics} from '@/lib/host-metrics';
const size=(v:number)=>v>=1024**3?(v/1024**3).toFixed(1)+' GiB':Math.round(v/1024**2)+' MiB';
export default function HostVitals({metrics}:{metrics?:HostMetrics}){
 const[now,setNow]=useState(0);
 useEffect(()=>{const first=setTimeout(()=>setNow(Date.now()),0),timer=setInterval(()=>setNow(Date.now()),1000);return()=>{clearTimeout(first);clearInterval(timer)}},[]);
 if(!metrics)return <div className="muted small" style={{maxWidth:340}}>CPU and memory: waiting for a metrics-enabled agent.</div>;
 const age=Math.max(0,Math.floor((now-Date.parse(metrics.receivedAt))/1000)),stale=age*1000>Math.max(20000,metrics.intervalSeconds*2500);
 return <section aria-label="Server CPU and memory" style={{minWidth:280,maxWidth:380,opacity:stale?.6:1}}><div style={{display:'flex',gap:24}}><div style={{flex:1}}><span className="muted small">CPU</span><div><strong>{metrics.cpuPercent===undefined?'Sampling…':metrics.cpuPercent.toFixed(1)+'%'}</strong></div>{metrics.cpuPercent!==undefined&&<progress aria-label="CPU utilization" max={100} value={metrics.cpuPercent} style={{width:'100%',accentColor:'#0078bd'}}/>}</div><div style={{flex:1}}><span className="muted small">Memory</span><div><strong>{metrics.memoryPercent.toFixed(1)}%</strong></div><progress aria-label="Memory utilization" max={100} value={metrics.memoryPercent} style={{width:'100%',accentColor:'#0078bd'}}/><div className="muted small">{size(metrics.memoryUsedBytes)} / {size(metrics.memoryTotalBytes)}</div></div></div><div className="muted small">{stale?'Stale · last sample':'Updated'} {age}s ago · Linux host</div></section>;
}
