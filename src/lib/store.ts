import{memoryStore}from'./memory-store';
import{dynamoStore}from'./dynamo-store';
export const store=process.env.GUARDIAN_TABLE?dynamoStore:memoryStore;
