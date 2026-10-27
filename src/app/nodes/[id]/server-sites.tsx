import {validateDiscoveredHosts} from '@/lib/server-sites';

export default function ServerSites({urls,hosts}:{urls:string[];hosts:string[]}){
 const configuredHosts=new Set(urls.flatMap(url=>{try{return [new URL(url).hostname]}catch{return []}}));
 const links=[...urls.map(url=>({url,label:url.replace(/^https?:\/\//,'').replace(/\/$/,''),title:'Open website'})),
  ...validateDiscoveredHosts(hosts).filter(host=>!configuredHosts.has(host)).map(host=>({url:`https://${host}/`,label:host,title:'Apache/Nginx-configured hostname; HTTPS assumed, availability not verified'}))];
 if(!links.length)return null;
 return <span aria-label="Server websites">{links.map(({url,label,title})=><span key={url}> · <a href={url} title={title} target="_blank" rel="noopener noreferrer">{label} ↗</a></span>)}</span>;
}
