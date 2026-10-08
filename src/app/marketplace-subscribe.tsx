export default function MarketplaceSubscribe(){
 const value=process.env.GUARDSCALE_MARKETPLACE_URL??'https://aws.amazon.com/marketplace/pp/prodview-rhtryiryciphg';
 if(!value)return null;
 let url:URL;try{url=new URL(value)}catch{return null}
 if(url.protocol!=='https:'||url.hostname!=='aws.amazon.com'||!url.pathname.startsWith('/marketplace/'))return null;
 return <a href={url.href} target="_blank" rel="noopener noreferrer" className="button primary" aria-label="Subscribe to GuardScale on AWS Marketplace">Subscribe on AWS Marketplace</a>;
}

