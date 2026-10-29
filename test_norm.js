const normalizeSnPhone = (value) => {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  return /^[67]\d{8}$/.test(digits) ? digits : '';
};

console.log('776111463:', normalizeSnPhone('776111463'));
console.log('77 61 11 463:', normalizeSnPhone('77 61 11 463'));
console.log('221776111463:', normalizeSnPhone('221776111463'));
console.log('776111463 with spaces cleaned:', normalizeSnPhone(' 77 61 11 463 '));