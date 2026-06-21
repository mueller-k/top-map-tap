# Authenticate GroupMe callbacks with capability URLs

GroupMe callback requests do not include a verifiable signature, so each GroupMe Live Import uses an unlisted URL containing a browser-generated 256-bit secret as its credential. Top Map Tap stores only the secret's hash, additionally checks the configured GroupMe group ID, shows the URL only once after creation, and provides no recovery, rotation, or lifecycle controls; this accepts operational inflexibility in exchange for preserving the Leaderboard's simple shared-access model.
