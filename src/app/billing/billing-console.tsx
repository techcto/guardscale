'use client';
import{useEffect,useState}from'react';
type Product={id:string;name:string;description:string;monthlyPrice:number;serverLimit:number;available:boolean};
export default function BillingConsole(){
 const[products,setProducts]=useState<Product[]>([]),[currentPlanId,setCurrentPlanId]=useState<string|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;fetch('/api/v1/products').then(x=>x.json()).then(data=>{if(active)setProducts(data)});return()=>{active=false}},[]);
 useEffect(()=>{let active=true;fetch('/api/v1/billing/plan').then(r=>r.ok?r.json():null).then(data=>{if(active&&data)setCurrentPlanId(data.productId)});return()=>{active=false}},[]);
 async function checkout(id:string){setError('');const r=await fetch('/api/billing/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:id})}),data=await r.json();if(!r.ok){setError(data.error);return}window.location.assign(data.url)}
 return <>{error&&<div className="notice"><strong>Billing unavailable</strong><span>{error}</span></div>}<section className="grid">{products.map(p=>{const isCurrent=p.id===currentPlanId;return <article className="g-card price-card" key={p.id}><div className="eyebrow">{p.name}</div><div className="price"><strong>${p.monthlyPrice}</strong><span>/month</span></div><p className="muted">{p.description}</p><p>Up to {p.serverLimit} server{p.serverLimit===1?'':'s'}</p>{isCurrent?<button className="button" disabled>Current plan</button>:p.monthlyPrice===0?<button className="button" disabled>Included</button>:<button className="button primary" onClick={()=>checkout(p.id)}>Upgrade</button>}</article>})}</section></>
}
