// src/lib/proofUpload.ts

// ✅ This file is now just a wrapper.
// It redirects all calls to the robust, safe uploader in 'api.ts'.
// This ensures you use the Direct-to-Railway connection + Sequential Uploads everywhere.

export { uploadProofFiles } from './api';