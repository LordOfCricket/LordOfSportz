// Runs on EAS before install: non-development builds must have an https API URL configured
// through EAS environment variables (never committed). Fails the build early and clearly.
const profile = process.env.EAS_BUILD_PROFILE;
const name = 'EXPO_PUBLIC_API_BASE_URL';
if (profile && profile !== 'development') {
  const url = process.env[name];
  if (!url || !url.startsWith('https://') || url.includes('example.com')) {
    console.error(`[release] ${name} must be a real https:// URL for the "${profile}" profile. Set it with: eas env:create --environment ${profile} --name ${name} --value <url> --visibility plaintext`);
    process.exit(1);
  }
}
