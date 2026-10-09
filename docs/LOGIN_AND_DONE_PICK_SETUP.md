# No-email approval login and Done Pick List photo matching

## One-time Google login setup

These steps affect only the independent project **PJS OMS Independent**. The original PJS Delivery Control site and its Supabase project are not modified.

1. In [Google Cloud Console](https://console.cloud.google.com/auth/overview), configure the OAuth consent screen and create an OAuth client of type **Web application**.
2. Use this **Google Authorized redirect URI** (the Supabase callback, *not* the OMS website):
   `https://tbkytdktututiyeoqkwa.supabase.co/auth/v1/callback`
3. In [Independent OMS Supabase Authentication → Providers](https://supabase.com/dashboard/project/tbkytdktututiyeoqkwa/auth/providers), enable **Google** and enter the Google OAuth **Client ID** and **Client Secret**. Keep the Client Secret only in Supabase.
4. In [Authentication → URL Configuration](https://supabase.com/dashboard/project/tbkytdktututiyeoqkwa/auth/url-configuration), set **Site URL** to:
   `https://pjs-oms-independent-pjsspare098-2655.vercel.app/`
   and allow the same URL in **Redirect URLs**.
5. Open [PJS Operations](https://pjs-oms-independent-pjsspare098-2655.vercel.app/) and choose **Continue with Google**. Sign in to the Google account you are authorized to use.
6. Existing provisioned Supabase email/password accounts may instead use the password login. No password creation or email approval is performed by the website.

A Gmail SMTP password is **not** needed for Google OAuth. The provider must be enabled by the project administrator before the button can complete a login.

## Done Pick List photo process

1. Sign in to the independent OMS cloud workspace.
2. Data Store → **Upload Pick Slip** to create the master process if not already present. Verify its **Process No., Party Name and SO No.**, then save.
3. Data Store → **Upload Done Pick List**. Take a phone-camera photo or upload JPG, PNG, WebP or PDF (5 MB max).
4. Device OCR finds the **Process No.** only when a Process/Process Number/Process No. label is present. It intentionally does not guess from Sales Order, LR or Pick Slip numbers.
5. Review or correct the Process No.; OMS finds the matching record in private Supabase by **exact Process No.**. It will not create a new record from the Done Pick List.
6. Click **Confirm & attach photo**. OMS checks that you own the matching process again, saves the original photo in the **private** storage bucket with type `donePickDoc`, and writes an audit entry.
7. Open the process from Data Store to see its **Done Pick List** badge and attachment link.

No match, an unconfirmed result, or an unauthenticated session cannot save a Done Pick List photo to another process. OCR reads on the device and can require manual correction, especially for handwriting or poor lighting.

## Important current limits

- Auth provider credentials and URL redirects are administrator settings and cannot safely be populated by the public website.
- Records are currently **scoped per authenticated user**. Shared-team access needs explicit organization/role and invitation controls; it has not been enabled.
- The offline office Python worker is **not** executing DataDoc, Outlook or courier jobs. Those features still need the office PC worker connected and tested.
- The local-only preview does **not** upload or retain photo bytes. Use Google/password sign-in for cloud attachments.
- Never put OAuth secrets, SMTP passwords, service-role keys or customer documents in GitHub. Consider making the repository private.
