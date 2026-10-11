import PublicHome from './public-home';
export default function Home(){return <PublicHome saas={process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas'}/>}
