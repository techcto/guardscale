import {Suspense} from 'react';
import NodesConsole from './nodes-console';
import {browserSession} from '@/lib/browser-session';
import './fleet.css';
export default async function Nodes(){const session=await browserSession();return <Suspense fallback={null}><NodesConsole canManage={session?.role==='root'||session?.role==='admin'}/></Suspense>}
