export type CallKind="voice"|"video";
export type CallState="idle"|"calling"|"ringing"|"connected"|"ended"|"unavailable";
export type CallSession={id:string;peerId:string;kind:CallKind;state:CallState;startedAt?:string};
/** Native WebRTC adapter contract. Expo Go intentionally does not fake a connected call. */
export interface CallTransport{start(session:CallSession):Promise<CallSession>;accept(session:CallSession):Promise<CallSession>;hangup(session:CallSession):Promise<CallSession>;}
