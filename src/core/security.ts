/**
 * Security boundary for NexChat.
 * Keep cryptographic decisions centralized instead of scattering them across UI.
 */
export type SecurityEvent =
  | "device-added"
  | "device-revoked"
  | "recovery-created"
  | "remote-lock"
  | "vault-cleared";

export function describeSecurityEvent(event:SecurityEvent){
  return {event,at:new Date().toISOString()};
}
