# Automatic Sandbox Creation for New Users

This document explains how sandboxes are automatically created when new users join your Manta Editor application.

## 🚀 **Complete Implementation Overview**

The system now automatically creates sandboxes for new users through multiple trigger points to ensure every user gets their development environment set up seamlessly.

## 🔄 **Automatic Creation Triggers**

### 1. **During User Registration** (Primary)
When a new user signs up:

```typescript
// SignUpForm.tsx - After successful registration
await authClient.signUp.email({ name, email, password });
await refreshSession(); // Get the new session
await fetch('/api/sandbox/init', { method: 'POST' }); // Create sandbox
toast.success('Account created and development environment ready!');
```

### 2. **During Session Initialization** (Backup)
When any user signs in or loads the app:

```typescript
// auth-context.tsx - Auto-check on every auth
const checkData = await fetch('/api/sandbox/init', { method: 'GET' });
if (!checkData.sandbox) {
  // User has no sandbox, create one automatically
  await fetch('/api/sandbox/init', { method: 'POST' });
}
```

### 3. **Manual Initialization** (Fallback)
If automatic creation fails, users can manually trigger it:

```typescript
// SandboxStatus.tsx - Manual trigger button
<Button onClick={handleInitialize}>Initialize Sandbox</Button>
```

## 📋 **Step-by-Step User Experience**

### For New Users:
1. **Sign Up** → Account created
2. **🔄 Automatic Sandbox Creation** → Sandbox created in background  
3. **✅ Success Notification** → "Account created and development environment ready!"
4. **🎉 Welcome Message** → Special UI for new users
5. **📱 Immediate Access** → Sandbox panel shows active sandbox

### For Existing Users:
1. **Sign In** → Session restored
2. **🔍 Sandbox Check** → System checks for existing sandbox
3. **📱 Load Existing** → Shows current sandbox status
4. **🔄 Auto-Create if Missing** → Creates sandbox if somehow missing

## 🛠️ **Technical Implementation**

### Core Components

#### 1. **SignUpForm Enhancement**
```typescript
// src/components/auth/SignUpForm.tsx
- ✅ Triggers sandbox creation immediately after registration
- ✅ Shows appropriate success messages
- ✅ Graceful error handling (doesn't fail signup if sandbox fails)
```

#### 2. **Auth Context Enhancement**  
```typescript
// src/lib/auth-context.tsx
- ✅ Checks for sandbox on every session initialization
- ✅ Automatically creates missing sandboxes
- ✅ Non-blocking (doesn't break auth if sandbox fails)
```

#### 3. **Sandbox Status Component**
```typescript
// src/components/sandbox/SandboxStatus.tsx
- ✅ Special "Welcome" UI for new users
- ✅ Manual initialization button as fallback
- ✅ Real-time status updates
```

#### 4. **Notification System**
```typescript
// src/components/sandbox/SandboxCreationNotification.tsx
- ✅ Welcome notifications for new users
- ✅ Success notifications when sandbox is ready
- ✅ Non-intrusive toast notifications
```

### API Endpoints

#### POST `/api/sandbox/init`
Creates a new sandbox for authenticated user:
```json
Request: POST /api/sandbox/init
Response: {
  "success": true,
  "sandbox": {
    "sandboxId": "user-123",
    "sandboxUrl": "https://run.blaxel.ai/workspace/sandboxes/user-123",
    "mcpServerUrl": "wss://run.blaxel.ai/workspace/sandboxes/user-123",
    "createdAt": "2024-01-15T10:30:00Z",
    "status": "active"
  }
}
```

#### GET `/api/sandbox/init`
Checks existing sandbox for authenticated user:
```json
Request: GET /api/sandbox/init
Response: {
  "sandbox": {
    "sandboxId": "user-123",
    "sandboxUrl": "...",
    "mcpServerUrl": "...",
    "createdAt": "2024-01-15T10:30:00Z",
    "status": "standby"
  }
}
```

## 🎯 **User Flow Examples**

### 📝 **New User Registration**
```
1. User fills out signup form
2. ✅ Account created in database
3. 🔄 Session established  
4. 🚀 Sandbox creation triggered automatically
5. 📱 UI shows "Welcome to Manta! 🎉"
6. ⏳ "Setting up your development environment..."
7. ✅ "Your development environment is ready! 🚀"
8. 📊 Sandbox panel shows active sandbox
```

### 🔑 **Existing User Login**
```
1. User signs in
2. ✅ Session restored
3. 🔍 System checks for existing sandbox
4. 📱 Loads existing sandbox info
5. 📊 Sandbox panel shows current status
```

### 🛠️ **Manual Initialization (Edge Case)**
```
1. User has account but no sandbox (rare)
2. 📱 Sandbox panel shows "Initialize Sandbox" button
3. 🔄 User clicks button
4. 🚀 Sandbox created
5. ✅ Success notification shown
```

## 🎨 **UI/UX Features**

### Visual Indicators
- **🎉 Welcome Messages**: Special greeting for new users
- **⏳ Loading States**: Shows sandbox creation progress
- **✅ Success Notifications**: Confirms successful setup
- **📊 Status Display**: Real-time sandbox status
- **🔄 Refresh Controls**: Manual refresh options

### User Feedback
- **Toast Notifications**: Non-intrusive status updates
- **Progress Indicators**: Loading spinners during creation
- **Error Handling**: Graceful degradation if creation fails
- **Contextual Messages**: Different messages for different scenarios

## 🔧 **Configuration**

### Sandbox Settings
```typescript
// src/lib/blaxel.ts
export const BLAXEL_CONFIG = {
  defaultImage: "blaxel/prod-base:latest",
  defaultMemory: 4096,
  defaultPorts: [{ target: 3000, protocol: "HTTP" }],
  sandboxTTL: "24h",
};
```

### Database Schema
```sql
-- User table enhancement
ALTER TABLE "user" ADD COLUMN sandbox_id VARCHAR(255);

-- Example data
-- user_id: "abc123"  
-- sandbox_id: "user-abc123"
```

## 🚨 **Error Handling**

### Graceful Degradation
- ✅ Signup succeeds even if sandbox creation fails
- ✅ Login works even if sandbox check fails  
- ✅ Alternative creation methods available
- ✅ Clear error messages for debugging

### Retry Mechanisms
- ✅ Auto-retry on session refresh
- ✅ Manual retry via UI button
- ✅ Background retry on subsequent logins

## 📊 **Testing Scenarios**

### Test New User Registration
1. Sign up with new email
2. Verify sandbox creation in console logs
3. Check sandbox panel shows active sandbox
4. Verify notifications appear correctly

### Test Existing User Login  
1. Sign in with existing account
2. Verify existing sandbox loads
3. Check status displays correctly

### Test Manual Creation
1. Create user without sandbox (database manipulation)
2. Sign in and verify auto-creation
3. Test manual button if needed

## 🔗 **Related Files**

### Core Implementation
- `src/components/auth/SignUpForm.tsx` - Registration flow
- `src/lib/auth-context.tsx` - Session management  
- `src/lib/sandbox-service.ts` - Sandbox operations
- `src/app/api/sandbox/init/route.ts` - API endpoints

### UI Components
- `src/components/sandbox/SandboxStatus.tsx` - Status display
- `src/components/sandbox/SandboxCreationNotification.tsx` - Notifications
- `src/hooks/useSandbox.ts` - React state management

### Configuration
- `src/lib/blaxel.ts` - Blaxel SDK configuration
- `src/lib/auth.ts` - Database schema updates

## ✅ **Implementation Complete**

The automatic sandbox creation for new users is now fully implemented with:

- ✅ **Multiple trigger points** ensuring no user is missed
- ✅ **Graceful error handling** that doesn't break core functionality  
- ✅ **Rich user feedback** with notifications and status displays
- ✅ **Fallback mechanisms** for edge cases
- ✅ **Clean UX** with welcome messages and progress indicators

Every new user will automatically get their personal development sandbox created and ready to use! 🚀

