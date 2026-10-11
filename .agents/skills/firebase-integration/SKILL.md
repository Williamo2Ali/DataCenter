---
name: firebase-integration
description: "Use when building with Firebase services: Authentication, Firestore, Cloud Functions, hosting, or Cloud Messaging."
---

# Firebase Integration

## When to Use This Skill
- Adding Firebase Authentication to a web or mobile app
- Using Firestore for real-time data synchronization
- Deploying Cloud Functions for backend logic
- Setting up Cloud Messaging for push notifications
- Hosting a static site with Firebase Hosting

## Workflow
1. Create a Firebase project at console.firebase.google.com
2. Install the Firebase CLI: `npm install -g firebase-tools`
3. Initialize: `firebase init` — select services to enable
4. For auth: enable sign-in methods in the console, add the SDK
5. For Firestore: define security rules, create indexes
6. For Functions: `firebase init functions`, write the function, deploy with `firebase deploy --only functions`
7. For hosting: add `firebase.json` config, deploy with `firebase deploy --only hosting`
8. Test with the Firebase emulator suite: `firebase emulators:start`

## Rules
- Never expose the admin SDK key to the client — use the web config
- Write security rules before enabling Firestore in production
- Use Firebase emulators for local development and testing
- Set up billing alerts — Firestore reads/writes can spike unexpectedly
- Use Cloud Functions for sensitive logic, not client-side code
- Test security rules with the Firebase Rules Playground
