// Whether the workflow tests may skip for want of PyYAML. On a dev machine a skip is fine; under CI a skip would report the guards as passing unrun,
// so there they run and fail loudly instead.
export function yamlSkip({ available, env }) {
  if (available) return false;
  return env.CI ? false : 'python3 with PyYAML is not available';
}
