import type { NextConfig } from 'next';
const config:NextConfig={reactStrictMode:true,output:'standalone',poweredByHeader:false,allowedDevOrigins:['host.docker.internal']};
export default config;
