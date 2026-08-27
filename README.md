# NexChat Mobile v0.1.0

Local-first privacy messaging foundation for Android and iOS.

## Current foundation
- Expo SDK 57
- Local-first app shell
- Guest mode
- Pseudonymous NexChat ID
- SecureStore-backed local encryption key
- TweetNaCl secretbox encryption for local vault payloads
- Encrypted local message/demo state
- Biometric capability check
- Storage/cache settings model
- Offline-first architecture interfaces
- Social/communication feature placeholders with real navigation
- NexChat branding

## Run
```bash
npm install
npx expo start
```

Use a compatible Expo Go client. For deeper native work (Bluetooth/P2P, SQLCipher, background services), move to an Expo Development Build.

## Security note
This is v0.1.0 foundation code, not a completed audited secure messenger. The local vault demonstrates authenticated encryption and secure key storage, but production security requires threat modeling, key lifecycle design, device binding, secure deletion, protocol review and independent audit.

## Planned native adapters
- Bluetooth LE / nearby transport
- Wi-Fi Direct / local P2P
- SQLCipher encrypted database
- background transfer
- hardware-backed key support where available
