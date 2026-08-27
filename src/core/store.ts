import { useSyncExternalStore } from "react";
import { readVault, saveVault, clearVault } from "./vault";

export type Message={peer:string;text:string;status:string;createdAt?:string};
type State={messages:Message[];vaultBytes:number};

let state:State={messages:[],vaultBytes:0};
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(l=>l());

async function persist(messages:Message[]){
  await saveVault({messages});
  state={...state,messages,vaultBytes:JSON.stringify(messages).length};
  emit();
}

export const useNexChatStore=()=>{
  const snap=useSyncExternalStore(
    (l)=>{listeners.add(l);return()=>listeners.delete(l)},
    ()=>state,
    ()=>state
  );
  return {
    ...snap,
    hydrate:async()=>{
      const data=await readVault<{messages:Message[]}>();
      state={messages:data?.messages||[],vaultBytes:JSON.stringify(data?.messages||[]).length};
      emit();
    },
    addMessage:async(m:Message)=>persist([...state.messages,{...m,createdAt:new Date().toISOString()}]),
    reset:async()=>{await clearVault();state={messages:[],vaultBytes:0};emit();}
  };
};
