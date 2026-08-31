import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
export type Identity={id:string;displayName:string;username:string};
const KEY="nexchat.identity.v1";
function makeId(){const b=Crypto.getRandomBytes(8);return `N-${Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,4)}-${Array.from(Crypto.getRandomBytes(4)).map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,4)}-${Math.floor(10+Math.random()*90)}`;}
export async function initIdentity(){if(!(await AsyncStorage.getItem(KEY))) await AsyncStorage.setItem(KEY,JSON.stringify({id:makeId(),displayName:"NexChat User",username:"user"}));}
export async function getIdentity():Promise<Identity>{const raw=await AsyncStorage.getItem(KEY);if(raw)return JSON.parse(raw);await initIdentity();return JSON.parse((await AsyncStorage.getItem(KEY))!);}
export async function updateIdentity(patch:Partial<Identity>){const cur=await getIdentity();await AsyncStorage.setItem(KEY,JSON.stringify({...cur,...patch}));}
