import {getVaultSize,verifyVault} from "./vault";
export async function inspectBackup(){return {encrypted:true,vaultBytes:await getVaultSize(),verified:await verifyVault()};}
export type BackupSchedule="off"|"daily"|"weekly"|"monthly";
