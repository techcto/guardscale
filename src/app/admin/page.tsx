import {redirect} from 'next/navigation';
import {rootSession,saasMode} from '@/lib/admin';
export default async function Admin(){await rootSession();redirect(saasMode()?'/admin/organizations':'/admin/settings')}
