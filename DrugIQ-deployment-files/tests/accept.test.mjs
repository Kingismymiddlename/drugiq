import {test} from 'node:test';
import assert from 'node:assert/strict';
import {negotiate,quality,parseAccept} from '../lib/accept.mjs';
const cases=[
 [undefined,'text/html'],['','text/html'],['*/*','text/html'],['text/*','text/html'],
 ['text/markdown','text/markdown'],['text/html','text/html'],['application/json',null],
 ['text/html;q=0.5, text/markdown;q=1','text/markdown'],
 ['text/markdown;q=0.5, text/html;q=1','text/html'],
 ['text/markdown;q=0, text/html;q=1','text/html'],
 ['text/html;q=0, text/markdown;q=0',null],
 ['text/html;q=0, */*;q=1','text/markdown'],
 ['text/markdown;q=0, */*;q=1','text/html'],
 ['text/html;q=0.1, text/markdown;q=0.5, */*;q=1','text/markdown'],
 ['text/markdown;q=1, */*;q=1','text/markdown'],
 ['text/html;q=0, text/*;q=0.5','text/markdown'],
 ['TEXT/MARKDOWN;Q=1','text/markdown'],
 ['text/markdown; charset=utf-8','text/markdown'],
 ['text/markdown; charset="UTF-8"','text/markdown'],
 ['text/markdown; charset=iso-8859-1',null],
 ['text/markdown; profile=unimplemented',null],
 ['text/markdown;q=2',null],['text/markdown;q=0.1234',null],
 ['text/html;q=0.8,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7','text/html'],
 ['text/markdown;q=1, text/html;q=1','text/html'],
 ['text/markdown;q=1; legacy="a,b"','text/markdown']
];
for(const [accept,want] of cases)test('Accept: '+String(accept),()=>assert.equal(negotiate(accept),want));
test('Default 404 preference is Markdown',()=>assert.equal(negotiate('*/*',['text/markdown','text/html']),'text/markdown'));
test('Malformed ranges are ignored, not granted an implicit wildcard',()=>assert.deepEqual(parseAccept('application, */json'),[]));
test('Explicit q=0 overrides wildcard for MCP',()=>assert.equal(quality('application/json,text/event-stream;q=0,*/*;q=1','text/event-stream').q,0));
test('Quoted media parameters containing commas do not break splitting',()=>assert.equal(parseAccept('text/markdown;profile="a,b",text/html').length,2));
