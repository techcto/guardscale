export async function register(){
 // Keep the import inside this documented NEXT_RUNTIME check so the edge bundle never compiles Node-only fixture code.
 if(process.env.NEXT_RUNTIME==='nodejs'){
  const fixtures=await import('./lib/dev-fixtures');
  if(fixtures.devFixturesEnabled())await fixtures.seedDevFixtures().catch(e=>console.error('GuardScale dev fixtures failed',e));
 }
}
