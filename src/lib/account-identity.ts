import {store} from './store';
import {normalizeEmail} from './email-verification';
export function accountIdentifier(value:unknown){return typeof value==='string'&&value.trim().length<=254?value.trim():'';}
// Regular accounts use their normalized email as the sole username. Root is
// authenticated separately with its deployment-managed username and password.
export async function userForIdentifier(value:unknown){const email=normalizeEmail(value);if(!email)return null;const user=await store.userByName(email);return user?.email?.toLowerCase()===email?user:null;}
