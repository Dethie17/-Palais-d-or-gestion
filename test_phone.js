const normalizeSnPhone = (value) => {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  return /^[67]\d{8}$/.test(digits) ? digits : '';
};

console.log('Raw 776111463 =>', normalizeSnPhone('776111463'));
console.log('With spaces =>', normalizeSnPhone('77 61 11 463'));
console.log('With dots =>', normalizeSnPhone('77.61.11.463'));
console.log('With dashes =>', normalizeSnPhone('77-61-11-463'));
console.log('International +221 =>', normalizeSnPhone('+221776111463'));
console.log('221 77 61 11 463 =>', normalizeSnPhone('221 77 61 11 463'));