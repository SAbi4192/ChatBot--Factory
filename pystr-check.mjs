import { writeFileSync } from 'node:fs';
import { pyStr } from './backend/services/export.service.js';

const input = 'café — dash élan';
const out = pyStr(input);
console.log('pyStr result:', out);
writeFileSync('D:/pytest/pystr_test.py', 'X = ' + out + '\nprint("python sees:", repr(X))\n', 'utf8');
