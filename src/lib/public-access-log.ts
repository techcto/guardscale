// Build public output from an allowlist, never from redacting arbitrary raw text.
export function publicAccessLog(message:string){
 const match=/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\s+\S+\s+status=([1-5]\d{2})\s+duration_ms=(\d+(?:\.\d+)?)(?:\s|$)/.exec(message);
 if(!match)return null;
 return {method:match[1],status:Number(match[2]),durationMs:Math.min(3600000,Math.round(Number(match[3])))};
}
