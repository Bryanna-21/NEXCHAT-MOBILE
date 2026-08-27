import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import nacl from "tweetnacl";
import { fromByteArray, toByteArray } from "base64-js";

const KEY_NAME="nexchat.vault.key.v1";
const DATA_KEY="nexchat.vault.payload.v1";

async function getKey(){
  let k=await SecureStore.getItemAsync(KEY_NAME);
  if(!k){
    const bytes=await Crypto.getRandomBytesAsync(32);
    k=fromByteArray(bytes);
    await SecureStore.setItemAsync(KEY_NAME,k,{requireAuthentication:false});
  }
  return toByteArray(k);
}

export async function initVault(){ await getKey(); }

export async function saveVault(value:unknown){
  const key=await getKey();
  const nonce=nacl.randomBytes(nacl.secretbox.nonceLength);
  const plaintext=new TextEncoder().encode(JSON.stringify(value));
  const boxed=nacl.secretbox(plaintext,nonce,key);
  await AsyncStorage.setItem(DATA_KEY,JSON.stringify({
    algorithm:"XSalsa20-Poly1305",
    nonce:fromByteArray(nonce),
    ciphertext:fromByteArray(boxed),
    version:1
  }));
}

export async function readVault<T>():Promise<T|null>{
  const raw=await AsyncStorage.getItem(DATA_KEY);
  if(!raw) return null;
  const payload=JSON.parse(raw);
  const key=await getKey();
  const plain=nacl.secretbox.open(toByteArray(payload.ciphertext),toByteArray(payload.nonce),key);
  if(!plain) throw new Error("Vault authentication failed");
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export async function clearVault(){
  await AsyncStorage.removeItem(DATA_KEY);
  await SecureStore.deleteItemAsync(KEY_NAME);
}
