import IncidentDetailConsole from './incident-detail-console';
export default async function IncidentDetail({params}:{params:Promise<{id:string}>}){const {id}=await params;return <IncidentDetailConsole incidentId={id}/>}
