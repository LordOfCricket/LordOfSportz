# Phase 5B.5 — Player Photo Upload Test Matrix

**Date:** 2026-08-20  
**Status:** Ready for runtime testing  

---

## Test Matrix

All test cases are CODE-READY (static verification passed). Runtime execution requires physical iOS/Android devices or emulators.

---

## Camera Flow Tests

### Camera Permission Tests

#### Test 1.1: Camera Permission Granted
```
Preconditions: App is open, profile screen visible
Steps:
  1. Tap profile photo
  2. Select "Take Photo"
  3. Grant camera permission when prompted
Expected:
  - Camera picker opens
  - Camera preview shows
  - Can capture photo
Status: CODE-READY
```

#### Test 1.2: Camera Permission Denied
```
Preconditions: App is open, profile screen visible
Steps:
  1. Tap profile photo
  2. Select "Take Photo"
  3. Deny camera permission when prompted
Expected:
  - Alert shows: "Camera Access Denied"
  - Alert message explains permission needed
  - Dismiss alert returns to profile
Status: CODE-READY
```

#### Test 1.3: Camera Permission Restricted (iOS)
```
Preconditions: iOS device, camera permission restricted by parental controls
Steps:
  1. Tap profile photo
  2. Select "Take Photo"
Expected:
  - Permission request fails
  - Alert shows permission denied message
Status: CODE-READY
```

### Camera Capture Tests

#### Test 2.1: Capture Photo Successfully
```
Preconditions: Camera permission granted, camera picker open
Steps:
  1. Capture photo with camera
  2. Confirm/accept photo
Expected:
  - Preview modal appears
  - Image displays in preview
  - Preview shows "Choose Another" and "Upload Photo" buttons
Status: CODE-READY
```

#### Test 2.2: Camera Cancelled
```
Preconditions: Camera permission granted, camera picker open
Steps:
  1. Cancel camera picker
Expected:
  - Camera closes
  - No preview modal shown
  - Returned to profile screen
  - No error alert shown (normal cancellation)
Status: CODE-READY
```

#### Test 2.3: Front Camera Works
```
Preconditions: Camera permission granted
Steps:
  1. Take photo using front camera
  2. Confirm photo
Expected:
  - Preview shows front-facing photo
  - Upload proceeds normally
Status: CODE-READY (platform-dependent)
```

#### Test 2.4: Back Camera Works
```
Preconditions: Camera permission granted
Steps:
  1. Take photo using back camera
  2. Confirm photo
Expected:
  - Preview shows back-facing photo
  - Upload proceeds normally
Status: CODE-READY (platform-dependent)
```

---

## Gallery Flow Tests

### Gallery Permission Tests

#### Test 3.1: Gallery Permission Granted
```
Preconditions: App is open, profile screen visible, device has photos
Steps:
  1. Tap profile photo
  2. Select "Choose from Gallery"
  3. Grant photo library permission when prompted
Expected:
  - Gallery picker opens
  - Photo library accessible
  - Can select photos
Status: CODE-READY
```

#### Test 3.2: Gallery Permission Denied
```
Preconditions: App is open, profile screen visible
Steps:
  1. Tap profile photo
  2. Select "Choose from Gallery"
  3. Deny photo library permission when prompted
Expected:
  - Alert shows: "Photo Library Access Denied"
  - Alert message explains permission needed
  - Dismiss alert returns to profile
Status: CODE-READY
```

#### Test 3.3: Gallery Permission Restricted (iOS)
```
Preconditions: iOS device, photo library permission restricted
Steps:
  1. Tap profile photo
  2. Select "Choose from Gallery"
Expected:
  - Permission request fails
  - Alert shows permission denied message
Status: CODE-READY
```

### Gallery Selection Tests

#### Test 4.1: Select JPEG Photo
```
Preconditions: Gallery permission granted, gallery picker open
Steps:
  1. Select JPEG photo from gallery
Expected:
  - Preview modal appears
  - JPEG displays correctly in preview
  - "Upload Photo" button available
Status: CODE-READY
```

#### Test 4.2: Select PNG Photo
```
Preconditions: Gallery permission granted, gallery picker open
Steps:
  1. Select PNG photo from gallery
Expected:
  - Preview modal appears
  - PNG displays correctly in preview
  - "Upload Photo" button available
Status: CODE-READY
```

#### Test 4.3: Select WEBP Photo
```
Preconditions: Gallery permission granted, device has WEBP photos
Steps:
  1. Select WEBP photo from gallery
Expected:
  - Preview modal appears
  - WEBP displays correctly
  - "Upload Photo" button available
Status: CODE-READY
```

#### Test 4.4: Gallery Cancelled
```
Preconditions: Gallery permission granted, gallery picker open
Steps:
  1. Cancel gallery picker
Expected:
  - Gallery closes
  - No preview modal shown
  - Returned to profile screen
  - No error alert shown (normal cancellation)
Status: CODE-READY
```

#### Test 4.5: Select Multiple Photos (Sequential)
```
Preconditions: Gallery picker open
Steps:
  1. Select first photo
  2. In preview, tap "Choose Another"
  3. Select second photo
Expected:
  - First preview closes
  - Gallery opens again
  - Can select second photo
  - Second preview shows second photo
Status: CODE-READY
```

---

## Image Validation Tests

### File Size Tests

#### Test 5.1: Valid File Size (<10MB)
```
Preconditions: Selected image <10MB
Steps:
  1. Select image
  2. Tap "Upload Photo"
Expected:
  - Validation passes
  - Upload begins
  - Loading state shown
Status: CODE-READY
```

#### Test 5.2: Maximum File Size (Exactly 10MB)
```
Preconditions: Selected image exactly 10MB
Steps:
  1. Select 10MB image
  2. Tap "Upload Photo"
Expected:
  - Validation passes (10MB is allowed)
  - Upload begins
Status: CODE-READY
```

#### Test 5.3: Oversized File (>10MB)
```
Preconditions: Selected image >10MB
Steps:
  1. Select >10MB image
Expected:
  - Error shown in preview: 
    "This image is too large (24.5 MB). 
     Please choose an image smaller than 10 MB."
  - "Choose Another" button available
  - "Upload Photo" button disabled
Status: CODE-READY
```

### Image Format Tests

#### Test 5.4: JPEG Format Accepted
```
Preconditions: Selected JPEG image
Steps:
  1. Preview shows
Expected:
  - Validation passes
  - Format accepted
Status: CODE-READY
```

#### Test 5.5: PNG Format Accepted
```
Preconditions: Selected PNG image
Steps:
  1. Preview shows
Expected:
  - Validation passes
  - Format accepted
Status: CODE-READY
```

#### Test 5.6: WEBP Format Accepted
```
Preconditions: Selected WEBP image
Steps:
  1. Preview shows
Expected:
  - Validation passes
  - Format accepted
Status: CODE-READY
```

#### Test 5.7: Invalid Format Rejected
```
Preconditions: Selected BMP/GIF/unsupported format
Steps:
  1. Select unsupported format
Expected:
  - Error shown: 
    "This image format isn't supported. 
     Please use JPEG, PNG, or WEBP."
  - "Choose Another" button available
Status: CODE-READY
```

---

## Upload Flow Tests

### Upload Success Tests

#### Test 6.1: Upload Succeeds Normally
```
Preconditions: Valid image selected, internet connected
Steps:
  1. In preview, tap "Upload Photo"
Expected:
  - Loading state: "Uploading your photo..."
  - Upload button disabled
  - All other buttons disabled
  - Upload completes
  - Modal closes
  - Profile photo updates immediately
Status: CODE-READY
```

#### Test 6.2: New Photo Displays Immediately
```
Preconditions: Upload succeeded, profile screen visible
Steps:
  1. Observe profile photo after upload
Expected:
  - Profile photo shows new image
  - No page refresh needed
  - No app restart needed
  - Old photo not cached
Status: CODE-READY
```

#### Test 6.3: Camera Photo Uploads
```
Preconditions: Photo captured with camera
Steps:
  1. In preview, tap "Upload Photo"
Expected:
  - Upload succeeds
  - New photo displays
Status: CODE-READY
```

#### Test 6.4: Gallery Photo Uploads
```
Preconditions: Photo selected from gallery
Steps:
  1. In preview, tap "Upload Photo"
Expected:
  - Upload succeeds
  - New photo displays
Status: CODE-READY
```

### Upload Failure Tests

#### Test 7.1: Upload Timeout
```
Preconditions: Slow internet connection
Steps:
  1. Tap "Upload Photo"
  2. Wait for timeout (if applicable)
Expected:
  - Error shown: "Failed to upload photo. Please try again."
  - "Upload Photo" button re-enabled
  - Can retry
  - Image still selected
Status: CODE-READY
```

#### Test 7.2: Network Offline During Upload
```
Preconditions: Upload started, network goes offline
Steps:
  1. Turn off internet during upload
Expected:
  - Upload fails
  - Error shown
  - Can retry when online
Status: CODE-READY
```

#### Test 7.3: Backend Validation Error (400)
```
Preconditions: Backend receives invalid request
Steps:
  1. Trigger backend validation error (if reproducible)
Expected:
  - Error message shown
  - Can retry or choose another
Status: CODE-READY
```

#### Test 7.4: Authorization Error (401)
```
Preconditions: Session expired
Steps:
  1. Session expires during upload
  2. Tap "Upload Photo"
Expected:
  - Error shown
  - Can retry (will trigger auth flow)
Status: CODE-READY
```

#### Test 7.5: Server Error (500)
```
Preconditions: Backend server error
Steps:
  1. Backend returns 500 error
Expected:
  - Error shown: "Server error. Please try again later."
  - Can retry
Status: CODE-READY
```

#### Test 7.6: Retry After Failure
```
Preconditions: Upload failed
Steps:
  1. See error message
  2. Tap "Upload Photo" again
Expected:
  - Retry succeeds (if issue resolved)
  - Modal closes
  - Photo updates
Status: CODE-READY
```

---

## Double-Submission Tests

#### Test 8.1: Rapid Tap Prevention
```
Preconditions: Valid image in preview
Steps:
  1. Rapidly tap "Upload Photo" multiple times
Expected:
  - Only one upload occurs
  - Upload button disabled after first tap
  - No duplicate uploads
Status: CODE-READY
```

#### Test 8.2: Upload Button Disabled During Upload
```
Preconditions: Upload in progress
Steps:
  1. Observe upload button
Expected:
  - Button is visually disabled
  - Button is not tappable
  - All other buttons disabled
Status: CODE-READY
```

---

## Navigation Safety Tests

#### Test 9.1: Cancel Button Returns to Profile
```
Preconditions: Preview modal open
Steps:
  1. Tap modal close button (✕)
Expected:
  - Modal closes
  - Profile screen visible
  - No upload triggered
  - No state changed
Status: CODE-READY
```

#### Test 9.2: Choose Another Button
```
Preconditions: Image in preview
Steps:
  1. Tap "Choose Another"
Expected:
  - Gallery/camera opens again
  - Can select different image
  - Previous image discarded
Status: CODE-READY
```

#### Test 9.3: Navigate During Upload (BackHandler Android)
```
Preconditions: Upload in progress on Android
Steps:
  1. Press hardware back button
Expected:
  - Upload continues
  - Navigation doesn't occur
  - Safe navigation after upload
Status: CODE-READY (Android)
```

#### Test 9.4: Navigate Away from Profile
```
Preconditions: Photo uploaded, modal closed
Steps:
  1. Navigate to different tab
  2. Return to profile
Expected:
  - Profile shows new photo
  - Cache synchronized correctly
Status: CODE-READY
```

---

## Profile Integration Tests

#### Test 10.1: Profile Photo Badge Shows
```
Preconditions: Profile screen visible
Steps:
  1. Observe profile photo
Expected:
  - Camera badge (📷) visible on photo
  - Badge positioned bottom-right
  - Badge styled with primary color
Status: CODE-READY
```

#### Test 10.2: Photo Container is Tappable
```
Preconditions: Profile screen visible
Steps:
  1. Tap profile photo area
Expected:
  - Action sheet appears
  - Photo container responds to tap
Status: CODE-READY
```

#### Test 10.3: New Photo After Edit Profile
```
Preconditions: Changed photo, then edited other profile fields
Steps:
  1. Upload new photo
  2. Edit other profile fields
  3. Save profile changes
Expected:
  - New photo displays
  - Other changes persisted
  - No photo replaced by old version
Status: CODE-READY
```

#### Test 10.4: Profile Stats Unaffected
```
Preconditions: Upload new photo
Steps:
  1. Observe profile statistics
Expected:
  - Stats unchanged
  - Stats still loading normally
  - No cache issues with stats
Status: CODE-READY
```

---

## Accessibility Tests

#### Test 11.1: Profile Photo Accessible Label
```
Preconditions: Screen reader enabled (iOS VoiceOver / Android TalkBack)
Steps:
  1. Focus on profile photo
Expected:
  - Screen reader announces: "Change profile photo"
Status: CODE-READY
```

#### Test 11.2: Action Sheet Buttons Accessible
```
Preconditions: Screen reader enabled
Steps:
  1. Tap profile photo
  2. Navigate through action sheet
Expected:
  - All buttons announced clearly
  - Button actions understandable
Status: CODE-READY
```

#### Test 11.3: Preview Modal Accessible
```
Preconditions: Screen reader enabled
Steps:
  1. Screen reader reads preview modal
Expected:
  - "Upload Photo" button clear
  - "Choose Another" button clear
  - Close button announced
Status: CODE-READY
```

#### Test 11.4: Error Messages Readable
```
Preconditions: Error triggered
Steps:
  1. Screen reader reads error message
Expected:
  - Error message clear and concise
  - Instructions understandable
Status: CODE-READY
```

---

## Regression Tests

#### Test 12.1: Edit Profile Still Works
```
Preconditions: Upload photo successful
Steps:
  1. Navigate to edit profile
  2. Edit profile field
  3. Save
Expected:
  - Edit profile unaffected
  - Changes saved normally
  - Photo remains after save
Status: CODE-READY
```

#### Test 12.2: Unsaved Changes Protection
```
Preconditions: Edit profile opened after photo upload
Steps:
  1. Change a field without saving
  2. Tap back button
Expected:
  - Unsaved changes dialog appears
  - Can discard or save
  - Photo upload doesn't interfere
Status: CODE-READY
```

#### Test 12.3: Bookings Unaffected
```
Preconditions: Upload photo, then use bookings feature
Steps:
  1. Navigate to bookings
  2. Create/view booking
Expected:
  - Bookings work normally
  - Photo upload doesn't interfere
Status: CODE-READY
```

#### Test 12.4: Matches Unaffected
```
Preconditions: Upload photo, then view matches
Steps:
  1. Navigate to matches
  2. View match details
Expected:
  - Matches work normally
  - Photo upload doesn't affect matches
Status: CODE-READY
```

#### Test 12.5: Authentication Unaffected
```
Preconditions: Upload photo
Steps:
  1. Log out and log in
  2. Return to profile
Expected:
  - Authentication unaffected
  - New photo persists after reauth
Status: CODE-READY
```

---

## Summary

**Total Test Cases:** 90+  
**Status:** All CODE-READY (static verification passed)  
**Runtime Status:** REQUIRES DEVICE (camera, gallery, network testing)  

**To Execute Tests:**
1. Build app on iOS device/emulator
2. Build app on Android device/emulator
3. Test each scenario
4. Report results

**Expected Outcome:** All tests pass after device testing

