import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

export type Identity = { id: string; guest: boolean; createdAt: string };

const KEY = "nexchat.identity.v1";

function randomDigits(n:number){
  let out="";
  while(out.length<n) out += Math.floor(Math.random()*10).toString();
  return out;
}

export async function createIdentity(guest=true): Promise<Identity>{
  const id = `N-${randomDigits(4)}-${randomDigits(4)}-${randomDigits(2)}`;
  const identity={id,guest,createdAt:new Date().toISOString()};
  await SecureStore.setItemAsync(KEY, JSON.stringify(identity));
  return identity;
}

export async function getIdentity():Promise<Identity|null>{
  const raw=await SecureStore.getItemAsync(KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function initIdentity(){
  if(!(await getIdentity())) await createIdentity(true);
}
