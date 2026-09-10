import {Attachment} from "./store";

/** Attachment policy boundary. Encryption-at-rest and durable indexing belong here before production. */
export function attachmentLabel(a:Attachment):string{return a.type==="image"?"Photo":a.type==="video"?"Video":a.type==="audio"?"Audio":"File";}
export function isExpired(a:Attachment):boolean{return !!a.expiresAt&&new Date(a.expiresAt).getTime()<=Date.now();}
