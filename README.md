# NexChat Mobile v0.2.0

Local-first Expo 54 messaging foundation.

## Included
- WhatsApp-style conversation list and chat screen
- Re-opening an existing conversation instead of creating duplicate chat entries
- Sent/received bubble alignment
- Message edit/delete/reply-ready data model
- Disappearing messages and view-once metadata
- Actual Android/iOS photo/video library picker through Expo ImagePicker
- Shared media index view inside contact information
- Pin/archive/mute/lock conversation controls
- Contact information sheet with voice/video call entry points
- Working local privacy/settings screens
- Themes: system/light/dark/black
- Backup settings and encrypted local vault
- Blocked contacts management
- Expo Crypto PRNG bridge for TweetNaCl

## Important V0.2 limitation
Real WebRTC voice/video calling, Bluetooth and Wi-Fi Direct require a custom native development build; Expo Go cannot load arbitrary native call/P2P modules. The UI and service boundaries are prepared for that native layer.
