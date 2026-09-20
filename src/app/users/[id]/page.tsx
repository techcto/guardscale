import UserDetailConsole from './user-detail-console';
export default async function UserDetail({params}:{params:Promise<{id:string}>}){const {id}=await params;return <UserDetailConsole userId={id}/>}
