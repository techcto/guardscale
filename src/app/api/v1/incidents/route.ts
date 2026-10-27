import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';
import {commandsFor} from '@/lib/protection-commands';import {withIncidentProtection} from '@/lib/incident-groups';
export async function GET(req:NextRequest){const session=await operator(req);if(!session)return NextResponse.json({error:'unauthorized'},{status:401});const [incidents,commands]=await Promise.all([store.incidents(session.orgId),commandsFor(session.orgId)]);return NextResponse.json(withIncidentProtection(incidents,commands))}
