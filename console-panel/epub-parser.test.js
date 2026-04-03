// Simple test to verify EpubParser can be instantiated
const EpubParser = require('./epub-parser.js');

console.log('Testing EpubParser instantiation...');

// Test 1: Class should be defined
if (typeof EpubParser !== 'function') {
  console.error('FAIL: EpubParser is not a function');
  process.exit(1);
}
console.log('PASS: EpubParser is a function');

// Test 2: Constructor should work with empty array buffer
const emptyBuffer = new ArrayBuffer(0);
const parser = new EpubParser(emptyBuffer);

if (!parser) {
  console.error('FAIL: Could not instantiate EpubParser');
  process.exit(1);
}
console.log('PASS: EpubParser instantiated successfully');

// Test 3: Instance should have expected properties
const expectedProps = ['arrayBuffer', 'zip', 'metadata', 'chapters', 'content'];
for (const prop of expectedProps) {
  if (!(prop in parser)) {
    console.error(`FAIL: Missing expected property: ${prop}`);
    process.exit(1);
  }
}
console.log('PASS: All expected properties exist');

// Test 4: Initial values should be correct
if (parser.arrayBuffer !== emptyBuffer) {
  console.error('FAIL: arrayBuffer not set correctly');
  process.exit(1);
}
if (parser.zip !== null) {
  console.error('FAIL: zip should be null initially');
  process.exit(1);
}
if (!Array.isArray(parser.chapters) || parser.chapters.length !== 0) {
  console.error('FAIL: chapters should be empty array');
  process.exit(1);
}
console.log('PASS: Initial values are correct');

console.log('\nAll tests passed!');
