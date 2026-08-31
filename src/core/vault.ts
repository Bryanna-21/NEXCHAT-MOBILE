import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import nacl from "tweetnacl";
import { fromByteArray, toByteArray } from "base64-js";

const KEY_NAME = "nexchat.vault.key.v2";
const DATA_KEY = "nexchat.vault.payload.v2";

nacl.setPRNG((x, n) => x.set(Crypto.getRandomBytes(n)));

type VaultEnvelope={version:2;algorithm:"XSalsa20-Poly1305";nonce:string;ciphertext:string};

async function getKey():Promise<Uint8Array>{
  let encoded=await SecureStore.getItemAsync(KEY_NAME);
  if(!encoded){
    encoded=fromByteArray(Crypto.getRandomBytes(32));
    await SecureStore.setItemAsync(KEY_NAME,encoded,{requireAuthentication:false});
  }
  const key=toByteArray(encoded);
  if(key.length!==nacl.secretbox.keyLength) throw new Error("Invalid NexChat vault key.");
  return key;
}
export async function initVault(){await getKey();}
export async function saveVault(value:unknown){
  const key=await getKey();
  const nonce=nacl.randomBytes(nacl.secretbox.nonceLength);
  const plaintext=new TextEncoder().encode(JSON.stringify(value));
  const ciphertext=nacl.secretbox(plaintext,nonce,key);
  const envelope:VaultEnvelope={version:2,algorithm:"XSalsa20-Poly1305",nonce:fromByteArray(nonce),ciphertext:fromByteArray(ciphertext)};
  await AsyncStorage.setItem(DATA_KEY,JSON.stringify(envelope));
}
export async function readVault<T>():Promise<T|null>{
  const raw=await AsyncStorage.getItem(DATA_KEY); if(!raw) return null;
  let envelope:VaultEnvelope;
  try{envelope=JSON.parse(raw) as VaultEnvelope;}catch{throw new Error("NexChat vault data is corrupted.");}
  if(envelope.version!==2||envelope.algorithm!=="XSalsa20-Poly1305") throw new Error("Unsupported NexChat vault format.");
  const plaintext=nacl.secretbox.open(toByteArray(envelope.ciphertext),toByteArray(envelope.nonce),await getKey());
  if(!plaintext) throw new Error("Vault authentication failed.");
  try{return JSON.parse(new TextDecoder().decode(plaintext)) as T;}catch{throw new Error("NexChat vault payload is invalid.");}
}
export async function hasVaultData(){return (await AsyncStorage.getItem(DATA_KEY))!==null;}
export async function getVaultSize(){const raw=await AsyncStorage.getItem(DATA_KEY);return raw?new TextEncoder().encode(raw).length:0;}
export async function verifyVault(){try{await saveVault({__vaultCheck:true});const ok=(await readVault<{__vaultCheck?:boolean}>())?.__vaultCheck===true;return ok;}catch{return false;}}
export async function clearVault(){await AsyncStorage.removeItem(DATA_KEY);await SecureStore.deleteItemAsync(KEY_NAME);}
