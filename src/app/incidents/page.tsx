import {Suspense} from 'react';
import IncidentsConsole from './incidents-console';
export default function Incidents(){return <Suspense fallback={null}><IncidentsConsole/></Suspense>}
