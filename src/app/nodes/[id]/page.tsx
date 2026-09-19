import NodeDetailConsole from './node-detail-console';
export default async function NodeDetail({params}:{params:Promise<{id:string}>}){const {id}=await params;return <NodeDetailConsole serverId={id}/>}
