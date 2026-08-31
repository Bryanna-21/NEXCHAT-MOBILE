export type P2PRoute="automatic"|"relay"|"wifi-direct"|"bluetooth";
export type P2PSettings={preferredRoute:P2PRoute;allowDirect:boolean;hideDirectAddress:boolean};
export const defaultP2PSettings:P2PSettings={preferredRoute:"automatic",allowDirect:false,hideDirectAddress:true};
/** Native Bluetooth/Wi-Fi Direct adapter boundary for the development build. */
export interface NearbyTransport{discover():Promise<string[]>;connect(peerId:string):Promise<void>;disconnect(peerId:string):Promise<void>;}
